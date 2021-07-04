const { songSchema } = require("./songSchema");

async function readAllSongs() {
  try {
    const result = await songSchema
      .find()
      .lean()
      .catch((err) => {
        console.log(err);
      });
    return result;
  } catch (e) {
    console.error(
      "Error " + e.name + " in function [readAllSongs] in [songDAO]" + e.message
    );
    return null;
  }
}

async function writeSongFromCSV(songObj) {
  try {
    const song = new songSchema(songObj);
    const result = await song.save().catch((err) => {
      console.log(err);
    });
    return result;
  } catch (e) {
    console.error(
      "Error " +
        e.name +
        " in function [writeSongFromCSV] in [songDAO]" +
        e.message
    );
    return null;
  }
}

async function updateSongObj(DBSongObj, iTunesSongArray, processingStatus) {
  try {
    let iTunesSongObj = iTunesSongArray[0];
    let iTunesSongThumnailUrl = iTunesSongObj.artworkUrl100;
    let iTunesSongImgUrl = iTunesSongThumnailUrl.replace(
      "100x100bb",
      "1000x1000bb"
    );

    const filter = { _id: DBSongObj._id };
    const update = {
      albumName: iTunesSongObj.collectionName,
      releaseDate: iTunesSongObj.releaseDate,
      imgURL: iTunesSongImgUrl,
      processStatus: processingStatus,
    };
    let result = await songSchema
      .findOneAndUpdate(filter, update, {
        new: true,
      })
      .catch((err) => {
        console.log(err);
      });
    return result;
  } catch (e) {
    console.error(
      "Error " +
        e.name +
        " in function [updateSongObj] in [songDAO]" +
        e.message
    );
    return null;
  }
}

async function updateSongLocalAddress(jobBatch, DBSongObj, imgName) {
  try {
    const filter = { _id: DBSongObj._id };
    const update = {
      imgLocalAddress: `./jobs/${jobBatch}/thumbnails/${imgName}.jpg`,
    };
    let result = await songSchema
      .findOneAndUpdate(filter, update, {
        new: true,
      })
      .catch((err) => {
        console.log(err);
      });
    return result;
  } catch (e) {
    console.error(
      "Error " +
        e.name +
        " in function [updateSongLocalAddress] in [songDAO]" +
        e.message
    );
    return null;
  }
}

async function updateSongStatues(DBSongObj, processingStatus) {
  try {
    const filter = { _id: DBSongObj._id };
    const update = {
      processStatus: processingStatus,
    };
    let result = await songSchema
      .findOneAndUpdate(filter, update, {
        new: true,
      })
      .catch((err) => {
        console.log(err);
      });
    return result;
  } catch (e) {
    console.error(
      "Error " +
        e.name +
        " in function [updateSongStatues] in [songDAO]" +
        e.message
    );
    return null;
  }
}

async function getSongStatues(DBSongObj) {
  try {
    let songId = DBSongObj._id;
    let song = await songSchema.findById(songId).catch((err) => {
      console.log(err);
    });
    let result = song.processStatus;
    return result;
  } catch (e) {
    console.error(
      "Error " +
        e.name +
        " in function [getSongStatues] in [songDAO]" +
        e.message
    );
    return null;
  }
}

async function readAllUnprocessedSongs(statues) {
  try {
    const result = await songSchema
      .find({ processStatus: `${statues}` })
      .lean()
      .catch((err) => {
        console.log(err);
      });
    return result;
  } catch (e) {
    console.error(
      "Error " +
        e.name +
        " in function [readAllUnprocessedSongs] in [songDAO]" +
        e.message
    );
    return null;
  }
}

async function clearDB() {
  try {
    const result = await songSchema
      .deleteMany({})
      .then(function () {
        console.log("Data deleted"); // Success
      })
      .catch(function (error) {
        console.log(error); // Failure
      });
    return result;
  } catch (e) {
    console.error(
      "Error " + e.name + " in function [clearDB] in [songDAO]" + e.message
    );
    return null;
  }
}

module.exports = {
  readAllSongs,
  writeSongFromCSV,
  updateSongObj,
  updateSongStatues,
  readAllUnprocessedSongs,
  updateSongLocalAddress,
  clearDB,
  getSongStatues,
};
