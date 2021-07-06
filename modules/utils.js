// Setup fs
const { promises: fs } = require("fs");
const songDAO = require("../modules/songDAO");
const imgFetch = require("node-fetch");
const AdmZip = require("adm-zip");
const converter = require("json-2-csv");
const iTunesAPI = require("../modules/iTunesAPI");
const csv = require("csvtojson");
let lastFetchTime = 0;

async function createJobDir(jobBatch) {
  let jobDir = `./public/jobs/${jobBatch}`;
  let thumbnailDir = `./public/jobs/${jobBatch}/thumbnails`;

  fs.mkdir(jobDir, { recursive: true }, (err) => {
    if (err) throw err;
  });
  fs.mkdir(thumbnailDir, { recursive: true }, (err) => {
    if (err) throw err;
  });
}

async function deleteDir(filePath) {
  try {
    await fs.rm(filePath, { recursive: true }, (err) => {
      if (err) throw err;
    });
  } catch (err) {
    console.error("Error " + err.name + " in function [delete]" + err.message);
  }
}

function validateItunesSongWithDBSong(iTunesSong, DBSong) {
  let iTunesSongName = escape(iTunesSong.trackName).toLowerCase();
  let iTunesSongArtistName = escape(iTunesSong.artistName).toLowerCase();
  let DBSongName = escape(DBSong.songName).toLowerCase();
  let DBSongArtistName = escape(DBSong.artistName).toLowerCase();

  let result = false;
  if (
    iTunesSongName.localeCompare(DBSongName) == 0 &&
    iTunesSongArtistName.localeCompare(DBSongArtistName) == 0
  ) {
    result = true;
  }
  return result;
}

async function updateSongInDB(song, songResultArray) {
  if (songResultArray.length == 1) {
    await songDAO.updateSongObj(song, songResultArray, "Processed");
  } else if (songResultArray.length == 0) {
    await songDAO.updateSongStatues(song, "Error: couldn't find any match");
  } else if (songResultArray.length > 1)
    await songDAO.updateSongObj(
      song,
      songResultArray,
      "Warning: multi results found"
    );
}

function fuzzyCompareItunesSongWithDBSong(iTunesSong, DBSong) {
  let iTunesSongName = escape(iTunesSong.trackName).toLowerCase();
  let DBSongName = escape(DBSong.songName).toLowerCase();
  let result = false;

  if (
    isWordCountEqual(iTunesSongName, DBSongName) &&
    similarity(iTunesSongName, DBSongName) > 0.9
  ) {
    result = true;
  }
  return result;
}

function isWordCountEqual(s1, s2) {
  return s1.split(" ").length == s2.split(" ").length;
}

function similarity(s1, s2) {
  var longer = s1;
  var shorter = s2;
  if (s1.length < s2.length) {
    longer = s2;
    shorter = s1;
  }
  var longerLength = longer.length;
  if (longerLength == 0) {
    return 1.0;
  }
  return (
    (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength)
  );
}

function editDistance(s1, s2) {
  s1 = s1.toLowerCase();
  s2 = s2.toLowerCase();

  var costs = new Array();
  for (var i = 0; i <= s1.length; i++) {
    var lastValue = i;
    for (var j = 0; j <= s2.length; j++) {
      if (i == 0) costs[j] = j;
      else {
        if (j > 0) {
          var newValue = costs[j - 1];
          if (s1.charAt(i - 1) != s2.charAt(j - 1))
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

function unifyImageName(songObj) {
  let songName = songObj.songName
    .replace(/[^a-zA-Z ]/g, "")
    .split(" ")
    .join("-");
  let artist = songObj.artistName
    .replace(/[^a-zA-Z ]/g, "")
    .split(" ")
    .join("-");
  let songId = songObj._id;
  let imgName = `${songName}-${artist}-${songId}`;
  return imgName;
}

async function download(url, imgName, jobBatch) {
  const response = await imgFetch(url);
  const buffer = await response.buffer();
  fs.writeFile(
    `./public/jobs/${jobBatch}/thumbnails/${imgName}.jpg`,
    buffer,
    () => console.log("finished downloading!")
  );
}

async function zipFolder(jobBatch) {
  const thumbnailsDir = `./public/jobs/${jobBatch}/thumbnails`;
  const zipDir = `./public/jobs/${jobBatch}/covers.zip`;

  const file = new AdmZip();
  file.addLocalFolder(thumbnailsDir);
  fs.writeFile(zipDir, file.toBuffer(), () => {
    console.log("zipped!");
  });
}

async function composeReport(jobBatch) {
  const songs = await songDAO.readAllSongs();
  const reportDir = `./public/jobs/${jobBatch}/report.csv`;
  const reports = [];
  for (let song of songs) {
    const imgName = unifyImageName(song);
    const songReport = {
      SONG: song.songName,
      ARTIST: song.artistName,
      ALBUM: song.albumName,
      PROCESS_STATIES: song.processStatus,
      IMG_NAME: imgName,
      ITUNES_URL: song.imgURL,
    };
    reports.push(songReport);
  }
  const reportObj = {
    rows: reports,
  };

  let json2csvCallback = async function (err, csv) {
    if (err) throw err;
    await fs.writeFile(reportDir, csv, "utf8", function (err) {
      if (err) {
        console.log(
          "Some error occured - file either not saved or corrupted file saved."
        );
      } else {
        console.log("It's saved!");
      }
    });
  };
  converter.json2csv(reportObj.rows, json2csvCallback, {
    prependHeader: true,
  });
}

function setTimer(songNumbers) {
  let timer = 0;
  if (songNumbers > 20) {
    timer = Math.random() * 1000 + 3000;
  }
  return timer;
}

async function sleep(millis) {
  return new Promise((resolve) => setTimeout(resolve, millis));
}

function trimItunesReturn(iTunesArray) {
  let result = [];
  for (const iTunesSongObj of iTunesArray) {
    let iTunesSongThumbnaillUrl = iTunesSongObj.artworkUrl100;
    let iTunesSongImgUrl = iTunesSongThumbnaillUrl.replace(
      "100x100bb",
      "1000x1000bb"
    );
    let simplifedItunesSongObj = {
      artistId: iTunesSongObj.artistId,
      trackName: iTunesSongObj.trackName,
      albumName: iTunesSongObj.collectionName,
      releaseDate: iTunesSongObj.releaseDate,
      imgURL: iTunesSongImgUrl,
    };
    result.push(simplifedItunesSongObj);
  }
  return result;
}

async function getSongsBySongName(song) {
  let currentTime = Date.now();
  let sleepTime = calculateSleepTime(currentTime, lastFetchTime);
  await sleep(sleepTime);

  let returnArray = [];
  let songName = song.songName;
  songName = songName.split(" ").join("+");

  let iTunesSongArray = await iTunesAPI.getItunesSongsBySongName(songName);
  //iTunesSongArray = trimItunesReturn(iTunesSongArray);
  for (const iTunesSong of iTunesSongArray) {
    if (validateItunesSongWithDBSong(iTunesSong, song)) {
      returnArray.push(iTunesSong);
    }
  }
  lastFetchTime = Date.now();
  return returnArray;
}

/**
 * 歌单里，有可能一个歌手有几首歌入选。可以在这里加个cache。其实这个场景cache的收益估计不大，但出于演示，可以弄一下。
 * cache pool不用很大，因为重复个歌手也就是前后几个。
 * 自己弄个内存cache或是用一个库都可以。内存cache库的主要功能是怎么处理过期，比如固定时间过期，或是条目hit的次数来决定过期
 * 
 * function Cache() {
 *   let data = {};
 * 
 *   function get(key) {
 *     return data[key];
 *   }
 * 
 *   function set(key, obj) {
 *     // check if pool's full, if it is then free some space.
 *     
 *     data[key] = obj;
 *   }
 * 
 *   this.get = get;
 *   this.set = set;
 * }
 * 
 * let cacheArtist = new Cache();
 * 
 * let iTunesArtistReturn = cacheArtist.get(artist);
 * if (iTunesArtistReturn == null) {
 *   iTunesArtistReturn = await iTunesAPI.getArtistIdByName(artist);
 *   
 *   // 注意，这里是把obj直接放了进去，如果后面对这个array里的数据有任何改动，cache里的数据也会被改
 *   // 因为它们指向同一块内存。比如iTunesArtistReturn[0].songName = "new"; cache里的数据也会被改。
 *   // 严谨说应该cache一份clone。比如 cacheArtist.set(artist, JSON.parse(JSON.stringfiy(iTunesArtistReturn)))
 *   cacheArtist.set(artist, iTunesArtistReturn);
 * }
 * 
 */
async function getSongsByArtist(song) {
  let currentTime = Date.now();
  let sleepTime = calculateSleepTime(currentTime, lastFetchTime);
  await sleep(sleepTime);
  let songResultArray = [];
  let artist = song.artistName;
  let iTunesArtistReturn = await iTunesAPI.getArtistIdByName(artist);
  if (iTunesArtistReturn.resultCount == 0) {
    lastFetchTime = Date.now();
    return songResultArray;
  } else {
    let iTunesAristId = iTunesArtistReturn.results[0].artistId;
    let iTunesSongArray = await iTunesAPI.getSongsByArtistID(iTunesAristId);
    for (const iTunesSong of iTunesSongArray.results) {
      if (validateItunesSongWithDBSong(iTunesSong, song)) {
        songResultArray.push(iTunesSong);
      }
    }
    if (songResultArray.length == 0) {
      for (const iTunesSong of iTunesSongArray.results) {
        if (fuzzyCompareItunesSongWithDBSong(iTunesSong, song)) {
          songResultArray.push(iTunesSong);
        }
      }
    }
    lastFetchTime = Date.now();
    return songResultArray;
  }
}

async function downloadSongCovers(jobBatch) {
  const allSongs = await songDAO.readAllSongs();

  for (let song of allSongs) {
    if (
      song.processStatus != "none" &&
      song.processStatus != "img downloaded"
    ) {
      let imgURL = song.imgURL;
      let imgName = unifyImageName(song);

      try {
        await download(imgURL, imgName, jobBatch);
        await songDAO.updateSongLocalAddress(jobBatch, song, imgName);
        await songDAO.updateSongStatues(song, "img downloaded");
      } catch (err) {
        /**
         * 异常处理的原则是，不要把exception吞掉，一定要log下来，否则如果程序出错，没有办法看到原始错误信息和stack trace，很难定位错误
         * 比如这里 try 里面有三个函数调用，里面某一个出错了，最后log只能看到这句console.log(`Song id:${song._id} has saving error`)
         * 具体错误被抛出的代码位置看不到了。因为这个err被吞掉了。
         * 
         * 错误处理可以往上看看文章，看看别人的最佳实践。
         * 总的来说有两点：
         * 1. 只捕获当前代码能处理的错误，如果不能处理（或者不想处理，具体看设计），就不处理它，让它原地爆炸，让上级代码想处理的人去catch它
         * 2. 如果catch了异常，一定不能把异常吞掉，至少是把这个异常object输出到log里
         * 
         * 具体到这里，updateSongLocalAddress里面已经捕获了所有，也就是说updateSongLocalAddress绝对不会抛出任何异常。这个处理是否合适，
         * 具体问题具体分析。早年微软的函数库，非常健壮，它处理任何的异常，你传一个错误参数进去，它一定会告诉你哪里错了，怎么错了。但那样的话，
         * 错误处理代码将会非常巨大。现代的做法，特别是用js的代码，几乎没有人这么做了。比如用jquery，你试试调用的时候传了一个错误参数，它不会告诉你
         * 这个参数错了，它只会不work。实际项目里，一般都是只在关键位置catch异常。比如这里downloadSongCovers的粒度感觉就比较合适，如果一首歌
         * 下载失败，在log里打一条错误，运维的人心里有数。但在updateSongLocalAddress就不捕获异常了，如果里面有任何错误（比如语法错误，数据
         * 库连接错误等等），依赖于底层代码抛出异常。但依赖于底层代码的异常，异常的信息往往难以理解，stack trace可能都有好几十层，很难看懂。
         * 总的来说，如果捕获了异常，一个原则是，自己能提供有价值的错误信息。比如这里输出了是处理这个songId时出错，就比较有价值。它有可能是
         * 底层代码比如updateSongLocalAddress时出错，比如字段名字typo，但在下层代码最终可能不会输出这个songId，就很难追踪错误。
         * 处理异常具体场景具体分析，是一个工程问题。
         */
        console.log(`Song id:${song._id} has saving error`);
      }
    }
  }
}

async function writeCSVtoDB(jobBatch) {
  const csvFilePath = `./public/jobs/${jobBatch}/${jobBatch}.csv`;
  const songListFromCSV = await csv().fromFile(csvFilePath);
  try {
    for (const song of songListFromCSV) {
      if (song.SONG == undefined || song.ARTIST == undefined) {
        break;
      }
      let songObj = {
        songName: song.SONG,
        artistName: song.ARTIST,
        processStatus: "none",
      };
      let result = await songDAO.writeSongFromCSV(songObj);
    }
    console.log("csv songs added to DB");
  } catch (err) {
    console.error(
      "Error " + err.name + " when coverting from csv " + err.message
    );
  }
}

function calculateSleepTime(currentTime, lastFetchTime) {
  const API_CALL_INTERVAL = ((60 * 1000) / 20) * 1.1;
  let elapsed = currentTime - lastFetchTime;
  let timeSleep = API_CALL_INTERVAL - elapsed;
  return Math.max(0, timeSleep);
}

module.exports = {
  createJobDir,
  validateItunesSongWithDBSong,
  updateSongInDB,
  fuzzyCompareItunesSongWithDBSong,
  unifyImageName,
  download,
  zipFolder,
  composeReport,
  deleteDir,
  getSongsBySongName,
  getSongsByArtist,
  downloadSongCovers,
  writeCSVtoDB,
};
