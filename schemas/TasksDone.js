import mongoose from "mongoose"

const schemaTasksDone = new mongoose.Schema({
    userId: String,
    taskId: String,
    createdAt: {
        type: Number,
        default: null
    },
})

export default schemaTasksDone