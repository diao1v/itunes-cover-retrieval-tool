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
