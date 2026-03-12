import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({

    userId: {
        type: mongoose.Schema.Types.ObjectId, ref: "Register",
        ref: "Register",
        default: null // null means broadcast
    },

    title: {
        type: String,
        required: true
    },

    message: {
        type: String,
        required: true
    },

    isBroadcast: {
        type: Boolean,
        default: false
    },

    isRead: {
        type: Boolean,
        default: false
    },

    scheduledFor: {
        type: Date,
        default: null
    },

    isSent: {
        type: Boolean,
        default: false
    },

    createdAt: {
        type: Date,
        default: Date.now
    }

});

// 🔥 AUTO DELETE AFTER 90 DAYS
messageSchema.index(
    { createdAt: 1 },
    { expireAfterSeconds: 60 * 60 * 24 * 90 }
);

export default mongoose.model("Message", messageSchema);