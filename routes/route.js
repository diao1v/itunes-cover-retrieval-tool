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

/**
 * 测试。自动化测试是成熟开发的重要环节，也是面试的加分项。
 * 
 * 理论说，所有的代码，比如每一个函数，开发完成后，开发人员肯定要运行一次，才能知道这个函数是否按照设计的功能运行。
 * 既然运行了一次这个函数，为什么不把这个运行过程，写成一个自动化测试的代码，以后可以随时运行，已验证代码是否还是正确
 * 
 * 测试主要分为
 * 1. unit test: 测试函数，每一个函数都应该有相应的unit test以验证函数是否按设计的运行。
 * 2. integration test: 这个是逻辑概念，一般认为是端到端的测试。比如端到端流程：整个上传csv，运行抓取图片，下载图片，
 *    是一个完整的测试用例。这个是逻辑概念，你也可以把上传CSV作为一个integration test。
 * 3. UI测试。如果是网页里运行，那么要进行基于用户在网页里操作的测试。unit test和integration test可能都不是出于最终
 *    用户考虑的。unit test测试发动机里的零件，integration test测试发动机，但最后用户只关心你的车能不能开。
 * 
 * 
 * unit test: 
 *   - 主要是函数级别的测试，说白了就是调用一下函数，看它是不是按照设计的运行。相对来说比较容易自动化。有很多
 *     自动化测试的框架可以用。
 * 
 *   - 特别需要注意的是函数依赖。比如dao.readAllSongs()是从数据库里读数据，那么在跑这个函数前，
 *   要准备好数据库。这里还是挺复杂的。特别是涉及到update和delete的时候。
 * 
 *   - 有些业务函数偏重于业务逻辑，最关心的不是数据库数据，有可能会mock数据。比如utils.getSongsByArtist()，
 *     里面有两个api调用拿数据，有可能那两个api调用mock一下就好，主要测试getSongsByArtist里面的业务逻辑。
 *     很多测试框架都有成熟的mocking方案。
 * 
 * integration test:
 *   - 跟unit test其实概念一样，只是范围更大。如果是造汽车的话，这里可能就直接是把车开上路了。
 *   - 网页程序的话，控制browser的测试比较复杂，特别是现在很多都是异步程序。selenium是比较受欢迎而且由来已久的工具
 * 
 * 对于测试的考虑
 *   - 没有自动化测试，可靠的快速的软件更迭是不可能。facebook一周发布一个版本。fb发展了这么多年，功能无数，如果手动测试，
 *     把所有功能跑一遍，可能一年都跑不完。一周发布一个版本根本不够时间测试。
 * 
 *   - 代码逻辑清晰，函数设计合理，低耦合，代码才容易测试。比如这里，主要的业务逻辑都在这个"/processing"里面，为了测试
 *     它，首先要起一个express服务器。但如果仔细分析的话，会发现这个程序的主要业务其实跟express没有关系，并不需要依赖
 *     web server。如果把这里的业务逻辑放到一个函数里，比如utils.runJob()。那么只要调用utils.runJob()就可以测试了。
 *     这就是为什么代码逻辑清晰，合理划分模块的重要性之一。
 * 
 *   - 实际项目里，很多公司特别是非IT公司，都不注重测试。毕竟领导只关心产品能不能造出来，不是很关心到底是怎么造的。程序员
 *     为了赶任务，也一样。写了10个函数，根本不测试运行，最后端对端的场景做出来了，草草运行一下，能跑过去就万事大吉。甚至
 *     不覆盖所有代码和场景。比如readAllSongs()返回空，没有歌曲，程序是否能运行。
 * 
 *   - 自动化测试用例理论上来说并没有增加太多的工作量。想一下如果你写了readAllSongs()这个函数，你总得在什么地方调用一下，
 *     观察结果来判断是否运行正常吧。熟练得话，把这个写成一个自动化测试的test case并没有增加工作量。但如果要测试全面，比如
 *     覆盖悲观和边界场景，就需要比较多的代码。另外如果要准备数据库或者其它依赖的话，也需要一点工作。但总的来说，覆盖一个
 *     乐观场景的test case只增加了很少的工作量，却收获了可以反复运行的test case。以后对函数进行任何修改，或者是改了其它地方
 *     ，都可以在运行一次test case来验证已有功能没有被搞坏。
 * 
 *   - 维护成本。很多公司不在乎测试的一个原因的，大家不愿意维护test case。比如我接手了同事的垃圾代码（所有程序员都觉得别的
 *     程序员写的代码是垃圾，能不碰就不碰），能把新的需求改出来，我就烧香拜佛了，还让我维护它的测试用例？能免则免吧，哈哈。
 * 
 *   - 现实项目里，能很重视测试的公司不是太多，毕竟多数公司都没有太强的研发能力。加上程序员是稀缺资源，也比较难找到靠谱的
 *     知道怎么写出健壮程序和测试的程序员。从业这么多年，见到多太多不合格的程序员，想让它们做到自动化测试？不可能。这样水平
 *     的程序员都有工作机会，可见靠谱程序员在行业里是多么的稀缺。所以能把项目做好的公司不是太多。特别是在非软件公司里。
 */
router.get(
  "/processing",
  verifyAuthenticated,
  checkCurrentJobBatch,
  async function (req, res) {
    const jobBatch = req.cookies.jobBatch;

    await utils.writeCSVtoDB(jobBatch);

    let unprocessedSong = await songDAO.getNextUnprocessedSong();

    /**
     * 可以这么写
     * let unprocessedSong;
     * while (unprocessedSong = await songDAO.getNextUnprocessedSong()) {
     * 
     * }
     * 
     * 或者
     * for (let unprocessedSong; unprocessedSong = await songDAO.getNextUnprocessedSong(); ) {
     * 
     * }
     */
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
