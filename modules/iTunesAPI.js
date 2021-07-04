const fetch = require("node-fetch");

async function getArtistIdByName(artistName) {
  let artist = artistName.split(" ").join("+");
  let response = await fetch(
    `https://itunes.apple.com/search?term=${artist}&entity=allArtist&attribute=allArtistTerm&limit=1`
  );
  let result = await response.json();
  return result;
}

async function getAblumsByArtistId(artistId) {
  let response = await fetch(
    `https://itunes.apple.com/lookup?id=${artistId}&entity=album&limit=200`
  );
  let result = await response.json();
  return result;
}

async function getSongsByArtistID(artistId) {
  let response = await fetch(
    `https://itunes.apple.com/lookup?id=${artistId}&entity=song&limit=200`
  );
  let result = await response.json();
  return result;
}

async function getSongsBySongName(songName) {
  let song = songName.split(" ").join("+");
  let response = await fetch(
    `https://itunes.apple.com/search?term=${song}&attribute=songTerm&entity=song&limit=200`
  );
  let result = await response.json();
  let songArray = result.results;
  return songArray;
}

module.exports = {
  getArtistIdByName,
  getAblumsByArtistId,
  getSongsBySongName,
  getSongsByArtistID,
};
