const express = require("express");
const router = express.Router();

const { v4: uuidv4 } = require("uuid");
const { verifyAuthenticated } = require("../modules/middleware");
const { checkCurrentJobBatch } = require("../modules/middleware");

const path = require("path");
const multer = require("multer");
const upload = multer({
  dest: path.join("./public/temp/"),
});

const { promises: fs } = require("fs");
const utils = require("../modules/utils");
const songDAO = require("../modules/songDAO");



router.get("/auth", function (req, res) {
  res.render("auth");
});

router.get("/", verifyAuthenticated, async function (req, res) {
  const jobBatch = req.cookies.jobBatch;

  if (jobBatch) {
    await utils.deleteDir(`./public/jobs/${jobBatch}/covers.zip`);
  }

  res.clearCookie("jobBatch");
  await songDAO.clearDB();
  res.render("home");
});

router.post("/", async function (req, res) {
  const accessCode = req.body.access_code;

  if (accessCode == "DQ") {
    const authToken = uuidv4();
    res.cookie("authToken", `${authToken}`);

    res.clearCookie("jobBatch");
    await songDAO.clearDB();
    res.render("home");
  } else {
    res.redirect("/auth");
  }
});

router.post(
  "/uploadFile",
  upload.single("file"),
  verifyAuthenticated,
  async function (req, res) {
    let jobBatch = uuidv4();
    res.cookie("jobBatch", `${jobBatch}`);

    await moveFileToFolder();

    async function moveFileToFolder() {
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
          err.name + " in function [moveFileToFolder] " + err.message
        );
        res.render("home");
      }
    }
  }
);

router.get(
  "/processing",
  verifyAuthenticated,
  checkCurrentJobBatch,
  async function (req, res) {
    const jobBatch = req.cookies.jobBatch;

    await utils.writeCSVtoDB(jobBatch);

    let unprocessedSong = await songDAO.getNextUnprocessedSong();

    while (unprocessedSong != null) {
      await songDAO.updateSongStatues(unprocessedSong, "in progress");

      let resultArray = await utils.getSongsBySongName(unprocessedSong);

      if (resultArray.length == 0) {
        resultArray = await utils.getSongsByArtist(unprocessedSong);
      }
      await utils.updateSongInDB(unprocessedSong, resultArray);
      unprocessedSong = await songDAO.getNextUnprocessedSong();
    }

    await utils.downloadSongCovers(jobBatch);

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

    await utils.composeReport(jobBatch);
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
