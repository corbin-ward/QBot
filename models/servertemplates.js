const { Schema, model, Types } = require('mongoose');

const serverTemplatesSchema = new Schema({
    serverId: {
        type: String,
        required: true,
    },
    templateId: {
        type: Types.ObjectId,
        required: true,
        ref: 'templates'
    }
})

module.exports = model('servertemplates', serverTemplatesSchema);