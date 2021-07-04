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
