const { Schema, model, Types } = require('mongoose');

const templatesSchema = new Schema({
    creatorId: {
        type: String,
        required: true,
    },
    name: {
        type: String,
        required: true,
    },
    iconUrl: {
        type: String,
        required: true,
    },
    queueSpots: {
        type: Number,
        required: true,
    },
    waitlistSpots: {
        type: Number,
        required: true,
    }
})

module.exports = model('templates', templatesSchema);