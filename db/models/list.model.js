const mongoose = require("mongoose");


const listSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    _userId: {
        type: mongoose.Types.ObjectId,
        required: true
    }
})

const List = mongoose.model('list', listSchema);

module.exports = List;