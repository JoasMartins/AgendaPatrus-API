const express = require("express")
const axios = require("axios")
const api = express()
const bodyParser = require("body-parser")
const mongoose = require("mongoose")
const appData = require("./appData.json")

api.use(bodyParser.json());

mongoose.connect(appData.api.databaseURL)
    .then(() => {

        console.log("🟢 | MongoDB conectada com sucesso!")
        api.listen(4000, async () => {
            console.log("🟢 | API ligada com sucesso!")
        })

    })
    .catch((err) => {
        console.log(err)
        console.log("❌ | MongoDB não foi conectadaaa!")
        console.log("❌ | API não foi ligada devido a não conexão com banco de dados!")
    })


// -------------------------------------------------------------

let modelTask = mongoose.model("Task", mongoose.Schema({
    title: String,
    description: String,
    type: String,
    date: Number,
}))

// -------------------------------------------------------------

api.get("/", async (req, res) => {
    return res.status(200).json({ result: "Sucess" })
})

api.post("/createTask", async (req, res) => {
    let response = req.body

    let newTask = {
        title: response.title,
        description: response.description,
        type: response.type,
        date: Date.now()
    }

    new modelTask(newTask).save()
        .then(() => {
            let dataResp = {
                form: newTask,
                status: 200
            }

            return res.status(200).json(dataResp)
        })
        .catch(err => {
            let dataResp = {
                form: response,
                status: 400,
                erro: err
            }

            return res.status(400).json(dataResp)
        })

})

api.get("/all", async (req, res) => {
    let items = await modelTask.find()
    console.log(items)

    return res.status(200).json(items)
})

api.get("/pegar", async (req, res) => {
    return res.status(200).json({ result: "Sucess NEWWW" })
})