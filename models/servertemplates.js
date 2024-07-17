const { Schema, model } = require('mongoose');

const serverTemplatesSchema = new Schema({
    serverId: {
        type: String,
        required: true,
    },
    templateId: {
        type: ObjectId,
        required: true,
    },
    dateAdded: {
        type: Date,
        required: true,
    }
})

module.exports = model('servertemplates', serverTemplatesSchema);