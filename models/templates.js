const { Schema, model } = require('mongoose');

const templatesSchema = new Schema({
    templateId: {
        type: ObjectId,
        required: true,
    },
    creatorId: {
        type: String,
        required: true,
    },
    name: {
        type: String,
        required: true,
    },
    icon: {
        type: String,
        required: true,
    },
    queueSpots: {
        type: Int32,
        required: true,
    },
    waitlistSpots: {
        type: Int32,
        required: true,
    }
})

module.exports = model('templates', templatesSchema);