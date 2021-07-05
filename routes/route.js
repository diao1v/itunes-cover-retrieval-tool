const express = require("express");
const router = express.Router();

const { v4: uuidv4 } = require("uuid");
const { verifyAuthenticated } = require("../modules/middleware");
const { checkCurrentJobBatch } = require("../modules/middleware");

// Setup multer (files will temporarily be saved in the "temp" folder).
const path = require("path");
const multer = require("multer");
const upload = multer({
  dest: path.join("./public/temp/"),
});

const { promises: fs } = require("fs");
const csv = require("csvtojson");
const utils = require("../modules/utils");
const songDAO = require("../modules/songDAO");
const iTunesAPI = require("../modules/iTunesAPI");

router.get("/", function (req, res) {
  res.render("auth");
});

router.get("/home", verifyAuthenticated, async function (req, res) {
  const jobBatch = req.cookies.jobBatch;

  if (jobBatch) {
    await utils.deleteDir(`./public/jobs/${jobBatch}/covers.zip`);
  }

  res.clearCookie("jobBatch");
  await songDAO.clearDB();
  res.render("home");
});

router.post("/home", async function (req, res) {
  const accessCode = req.body.access_code;

  if (accessCode == "DQ") {
    const authToken = uuidv4();
    res.cookie("authToken", `${authToken}`);
    res.clearCookie("jobBatch");
    await songDAO.clearDB();
    res.render("home");
  } else {
    res.redirect("/");
  }
});

router.post(
  "/uploadFile",
  upload.single("file"),
  verifyAuthenticated,
  async function (req, res) {
    let jobBatch = uuidv4();
    console.log(jobBatch);

    //save that job batch number to a cookie
    res.cookie("jobBatch", `${jobBatch}`);

    await utils.createJobDir(jobBatch);
    const fileInfo = req.file;
    const oldFileName = fileInfo.path;
    const newFileName = `./public/jobs/${jobBatch}/${jobBatch}.csv`;
    try {
      await fs.rename(oldFileName, newFileName, () => {
        console.log("file renamed");
      });
      res.locals.processingPage = true;
      res.render("processing");
    } catch (err) {
      console.error(
        "Error " + err.name + " in function [delete]" + err.message
      );
      res.render("home");
    }
  }
);

router.get(
  "/processing",
  verifyAuthenticated,
  checkCurrentJobBatch,
  async function (req, res) {
    /**
     * 主要业务逻辑都在这里，从代码逻辑简洁和可维护角度看，这里相当于汽车的拼装车间。拿到汽车的部件，比如发动机，方向盘，车身，轮胎，这里是组装起来。
     * 不应该暴露部件里的东西。接手需要改代码的同事，可以迅速把握代码的脉络，然后定位出问题或是需要修改的地方。
     * 对于一个函数，从代码行数看的话，一般不超过100行。超过100行的代码，说明可以再细分为函数，是逻辑更清晰。
     * 
     * 如果我写的话， 这个业务逻辑大概这么写
     * 

     * 
     * // 拿到jobBatch Id，因为它是放在cookie里，所以属于这个层次的逻辑
     * const jobBatch = req.cookies.jobBatch;
     * 
     * // 内部包含读取csv以及初始化数据库。当前层里不需要知道csv的存在，因为并不需要直接对csv进行操作
     * await initDBFromCSV(jobBatch);
     * 
     * // 读出所有需要处理的数据
     * let unprocessedSongs = await getAllUnprocessedSongs();
     * 
     * for (let songObj of unprocessedSongs) {
     *   await updateSongStatues(songObj, "in progress");
     * 
     *   // 函数里call api，对结果进行筛选（比如如果有多个结果，默认选第一个，歌名的对比等等逻辑），然后返回song。这个song包含后续处理需要的字段，比如url
     *   // 如果找不到，则返回null
     *   // song: {id, songName, albumName, releaseDate, imgURL, isMultipleResut}
     *   let song = await searchSongByName(songObj.songName, songObj.artistName);
     * 
     *   // 根据你的逻辑，如果根据歌名查不到，那么根据歌手下的所有歌曲查找（你的第二轮处理里）。
     *   if (song == null) {
     *     song = await searchSongByArtist(songObj.songName, songObj.artistName);
     *   }
     * 
     *   // 根据查找到的歌曲，更新数据库（如果歌曲每找到song是null）
     *   await updateSongItemInDB(songObj, song);
     * }
     * 
     * // 读出所有拿到图片的歌曲，下载图片
     * const songsWithImage = await getSongsWithImage();
     * 
     * await downloadImages(songsWithImage);
     * 
     * // 至此，处理结束
     * 
     * 
     * // 如果把注释去掉，就是一下代码。个人觉得，如果我读这个函数的话，可以比较清晰的了解程序的主脉络。如果在debug或是要修改部分逻辑，也可以比较迅速的定位
     *
     * const jobBatch = req.cookies.jobBatch;
     * 
     * await initDBFromCSV(jobBatch);
     * 
     * let unprocessedSongs = await getAllUnprocessedSongs();
     * 
     * for (let songObj of unprocessedSongs) {
     *   await updateSongStatues(songObj, "in progress");
     * 
     *   let song = await searchSongByName(songObj.songName, songObj.artistName);
     * 
     *   if (song == null) {
     *     song = await searchSongByArtist(songObj.songName, songObj.artistName);
     *   }
     * 
     *   await updateSongItemInDB(songObj, song);
     * }
     * 
     * const songsWithImage = await readSongsWithImage();
     * 
     * await downloadImages(songsWithImage);
     * 
     * 
     * // end
     * 
     * 
     * // 保证每个api call的间隔
     * // 每个请求间隔。以60秒20个请求为标准。乘1.1是加一点保险
     * const API_CALL_INTERVAL = (60 * 1000 / 20) * 1.1;
     * 
     * api call代码里，每个call函数都加上以下代码控制访问频率
     * async function getSongsBySongName() {
     *   let startTime = new Date().getTime();
     * 
     *   // make api call
     *   let result = apiCall();
     *   
     *   // 计算api call耗时，如果用的时间少于API_CALL_INTERVAL，则睡一会
     *   let endTime = new Date().getTime();
     *   let elapsed = endTime - startTime;
     *   let timeSleep = API_CALL_INTERVAL - elapsed;
     *   if (timeSleep > 0) {
     *     await sleep(timeSleep);
     *   }
     * }
     * 
     * // 也可以抽象为一个函数。其实还有更科学的方法，但这个简单实用
     * async function callWithWait(fn) {
     *   let startTime = new Date().getTime();
     * 
     *   // make api call
     *   let result = await fn();
     *   
     *   // 计算api call耗时，如果用的时间少于API_CALL_INTERVAL，则睡一会
     *   let endTime = new Date().getTime();
     *   let elapsed = endTime - startTime;
     *   let timeSleep = API_CALL_INTERVAL - elapsed;
     *   if (timeSleep > 0) {
     *     await sleep(timeSleep);
     *   }
     *   return result;
     * }
     * 
     * async function getSongsBySongName() {
     *   return callWithWait(function() {
     *     // make api call
     *   });
     * }
     */
    const jobBatch = req.cookies.jobBatch;

    const csvFilePath = `./public/jobs/${jobBatch}/${jobBatch}.csv`;

    const songListFromCSV = await csv().fromFile(csvFilePath);

    try {
      for (const song of songListFromCSV) {
        if(song.SONG==undefined||song.ARTIST==undefined){
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

    let unprocessedSongs = await songDAO.readAllUnprocessedSongs("none");

    if (unprocessedSongs.length == 0) {
      console.log("No song goes into first round");
    } else {
      for (let songObj of unprocessedSongs) {
        let songStatus = await songDAO.getSongStatues(songObj);
        if (songStatus == "none") {
          await songDAO.updateSongStatues(songObj, "in progress");

          let timer = utils.setTimer(unprocessedSongs.length);
          await utils.sleep(timer);

          let songResultArray = [];
          let iTunesSongArray = await iTunesAPI.getSongsBySongName(
            songObj.songName
          );

          for (const iTunesSong of iTunesSongArray) {
            if (utils.validateItunesSongWithDBSong(iTunesSong, songObj)) {
              songResultArray.push(iTunesSong);
            }
          }
          await utils.updateSongInDB(songObj, songResultArray);
          console.log("one sone finished");
        } else {
          continue;
        }
      }
      console.log("Done for the first round");
    }

    unprocessedSongs = await songDAO.readAllUnprocessedSongs(
      "Error: couldn't find any match"
    );

    if (unprocessedSongs.length == 0) {
      console.log("No song goes into second round");
    } else {
      for (let songObj of unprocessedSongs) {
        let timer = utils.setTimer(unprocessedSongs.length);
        await utils.sleep(timer);

        let songResultArray = [];
        let artist = songObj.artistName;
        let iTunesArtistReturn = await iTunesAPI.getArtistIdByName(artist);
        if (iTunesArtistReturn.resultCount == 0) {
          await songDAO.updateSongStatues(
            songObj,
            "Error: The artist name might be wrong"
          );
        } else {
          let iTunesAristId = iTunesArtistReturn.results[0].artistId;
          let iTunesSongArray = await iTunesAPI.getSongsByArtistID(
            iTunesAristId
          );
          for (const iTunesSong of iTunesSongArray.results) {
            if (utils.validateItunesSongWithDBSong(iTunesSong, songObj)) {
              songResultArray.push(iTunesSong);
            }
          }
          if (songResultArray.length == 0) {
            for (const iTunesSong of iTunesSongArray.results) {
              if (utils.fuzzyCompareItunesSongWithDBSong(iTunesSong, songObj)) {
                songResultArray.push(iTunesSong);
              }
            }
          }
          if (songResultArray.length != 0) {
            await utils.updateSongInDB(songObj, songResultArray);
          }
        }
      }
      console.log("Done for the second round");
    }

    const allSongs = await songDAO.readAllSongs();

    for (let song of allSongs) {
      if (
        song.processStatus != "none" &&
        song.processStatus != "img downloaded"
      ) {
        let imgURL = song.imgURL;
        let imgName = utils.unifyImageName(song);

        try {
          await utils.download(imgURL, imgName, jobBatch);
          await songDAO.updateSongLocalAddress(jobBatch, song, imgName);
          await songDAO.updateSongStatues(song, "img downloaded");
        } catch (err) {
          console.log(`Song id:${song._id} has saving error`);
        }
      }
    }

    console.log("All images have been saved");
    const finished = true;
    res.send(finished);
  }
);

router.get(
  "/download",
  verifyAuthenticated,
  checkCurrentJobBatch,
  async function (req, res) {
    const jobBatch = req.cookies.jobBatch;

    const allSongs = await songDAO.readAllSongs();

    await utils.composeReport(jobBatch, allSongs);
    await utils.zipFolder(jobBatch);
    const coversDownloadLink = `./jobs/${jobBatch}/covers.zip`;
    const reportDownloadLink = `./jobs/${jobBatch}/report.csv`;

    await utils.deleteDir(`./public/jobs/${jobBatch}/thumbnails`);

    res.locals.reportDownloadLink = reportDownloadLink;
    res.locals.coversDownloadLink = coversDownloadLink;

    res.render("download");
  }
);

module.exports = router;
