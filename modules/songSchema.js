const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const schema = new Schema({
    songName:{
        type: String,
        require: true
    },
    artistName:{
        type: String,
        require: true
    },
    albumName:{
        type: String,
    },
    releaseDate:{
        type: String,
    },
    processStatus:{
        type: String,
    },
    imgURL:{
        type: String,
    },
    localAddress:{
        type: String,
    }
}, {timestamps: true})

const songSchema = mongoose.model('SongsDB', schema)

module.exports = {
    songSchema
}
