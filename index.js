const express = require("express")
const axios = require("axios")
const api = express()
const bodyParser = require("body-parser")
const mongoose = require("mongoose")
const appData = require("./appData.json")
const crypto = require("crypto-js")
const nodemailer = require("nodemailer")
const multer = require("multer")
const xlsx = require("xlsx")
const cors = require('cors');
const { v4 } = require("uuid")
require('dotenv').config()

api.use(bodyParser.json());
api.use(express.json());
api.use(express.urlencoded({ extended: true }));
api.use(cors());

const storage = multer.memoryStorage()
const upload = multer({ storage: storage })

//xlsx.set_fs(fs)

let accoutEmail = {
    email: "soundtrack.equipe@gmail.com",
    password: "cuebbmxuvtkjvnuj"
}

const transporter = nodemailer.createTransport({
    //host: "smtp.gmail.com",
    service: "gmail",
    //port: 587,
    //secure: false,
    auth: {
        //  type: 'OAuth2',
        user: accoutEmail.email,
        pass: accoutEmail.password,
        //clientId: "23003790653-s4ktseg1sh3riedt12rf2toh7vi03aru.apps.googleusercontent.com",
        //clientSecret: "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",
        //  refreshToken: process.env.OAUTH_REFRESH_TOKEN
    }
})

mongoose.connect(process.env.DATABASE_URL + "/GLOBAL")
    .then((connection) => {
        const dbName = connection.connections[0].client.s.options.srvHost
        console.log(`🟢 | MongoDB conectada com sucesso!\n---> ${dbName}`)
        api.listen(4000, async () => {
            console.log("🟢 | API ligada com sucesso!")

            const sendNotification = async (diasRestantesSelecionado) => {
                const milliseconds = Date.now()
                const days = milliseconds / (24 * 60 * 60 * 1000)
                let day = Math.floor(days)

                let dbName = "pushTasksToday"
                if (diasRestantesSelecionado > 0) dbName = `pushTasks${diasRestantesSelecionado}Days`

                let pastAlertVerify = await modelLogAlerts.findOne({ name: dbName })
                if (pastAlertVerify?.value === day) return

                let settingsFind = `settings.pushTasks${diasRestantesSelecionado}Days`
                let profiles = []
                if (diasRestantesSelecionado == 0) profiles = await modelUsers.find({ "settings.pushTasksToday": true })
                if (diasRestantesSelecionado > 0) profiles = await modelUsers.find({ [settingsFind]: true })

                let tasksAll = await modelTask.find()
                let listTasksDiasRest = tasksAll.map((task) => {
                    let diasCalculados = Math.ceil((task.date - Date.now()) / (24 * 60 * 60 * 1000))
                    return { ...task, diasRest: diasCalculados }
                });



                let tasksComDoc = []
                if (diasRestantesSelecionado == 0) {
                    tasksComDoc = listTasksDiasRest.filter(task => task.diasRest == 0 || task.diasRest == -0)
                } else {
                    tasksComDoc = listTasksDiasRest.filter(task => task.diasRest == diasRestantesSelecionado)
                }

                let tasks = tasksComDoc.map(task => task._doc)

                profiles.map(async (profile) => {
                    let tasksTurma = tasks.filter(task => task.turma === profile.turma)
                    let device = await modelDevices.findOne({ email: profile.email })
                    let playerId = device?.userId


                    if (!tasksTurma[0]) return console.log(`[📵] ${profile.turma} | Dias restantes: ${diasRestantesSelecionado} | ${profile.fullname} | Nenhuma tarefa para a turma.`)

                    let text = ""
                    let score = 0
                    let tasksCount = 0

                    tasksTurma.map((item, index) => {
                        score++
                        tasksCount++
                        if (score < 4) {
                            let icon = ""
                            if (item.type == "Atividade") icon = "🔵 "
                            if (item.type == "Trabalho") icon = "🟡 "
                            if (item.type == "Prova") icon = "🔴 "
                            if (item.type == "Outro") icon = "⚪ "
                            text = text + `${score}. ${icon}${item.title};`
                            if (index < tasksTurma.length - 1) {
                                text = text + "\n" // Adiciona quebra de linha apenas se houver mais itens
                            }
                        }
                    })

                    if (tasksCount > 3) {
                        let newCount = tasksCount - 3
                        text = text + `E ${newCount > 1 ? "outras" : "outra"} ${newCount} ${newCount > 1 ? "tarefas" : "tarefa"}...`
                    }

                    let headText = "⏰ Tarefas para hoje"
                    if (diasRestantesSelecionado != 0) {
                        headText = `🗓️ Tarefas para daqui ${diasRestantesSelecionado} ${diasRestantesSelecionado <= 1 ? "dia" : "dias"}`
                    }

                    const headers = {
                        'Content-Type': 'application/json; charset=utf-8',
                        'Authorization': `Basic ${appData.onesginal.authorization}`,
                    };

                    const data = {
                        app_id: appData.onesginal.appId,
                        include_player_ids: [playerId],
                        headings: { "en": headText },
                        contents: { "en": text },
                    }

                    axios.post('https://onesignal.com/api/v1/notifications', data, { headers })
                        .then((respon) => console.log(`[🔔✅] ${profile.turma} | Dias restantes: ${diasRestantesSelecionado} | ${profile.fullname} | Notificação enviada com sucesso.`))
                        .catch((error) => console.error(`[🔔❌] ${profile.turma} | Dias restantes: ${diasRestantesSelecionado} | ${profile.fullname} | Erro ao enviar a notificação!`, error.message))

                    const milliseconds = Date.now()
                    const days = milliseconds / (24 * 60 * 60 * 1000)
                    let day = Math.floor(days)

                    if (pastAlertVerify) {
                        await modelLogAlerts.findOneAndUpdate({ name: dbName }, { $set: { value: day } })
                    } else {
                        new modelLogAlerts({
                            name: dbName,
                            type: "perDay",
                            value: day
                        }).save()
                    }
                })

            }

            //  ATENÇÃO! LIBERAR setinterval PARA O LANÇAMENTO FINAL!!!
            /*
            setInterval(async () => {
                axios.get(appData.api.url + "/")
                    .then(() => {
                        let formattedDate = new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })
                        let dateNow = new Date(formattedDate)
                        //dateNow.setHours(4)
                        let horas = dateNow.getHours()
                        let minutos = dateNow.getMinutes()
                        console.log(`HORAS: ${horas}:${minutos} >================================================`)

                        //sendNotification(0)

                        if (horas === 4) sendNotification(0) // 04h

                        if (horas === 13) sendNotification(1) // 13h
                        if (horas === 14) sendNotification(2) // 14h
                        if (horas === 15) sendNotification(3) // 15h
                        if (horas === 16) sendNotification(4) // 16h
                        if (horas === 17) sendNotification(5) // 17h
                        if (horas === 18) sendNotification(6) // 18h
                        if (horas === 19) sendNotification(7) // 19h
                        if (horas === 20) sendNotification(10)// 20h
                    })
                    .catch((err) => {
                        console.log("Ocorreu um erro ao chamar RESET! Nada foi feito.")
                        console.log(err)
                    })
            }, 1000 * 60 * 2)
            */

            //  FAZER: Nas notificações da restando mais de 0 dias, as tarefas que o user ja marcou
            //      como feito não será incluso em "text"
        })

    })
    .catch((err) => {
        console.log(err)
        console.log("❌ | MongoDB não foi conectado!")
        console.log("❌ | API não foi ligada devido a não conexão com banco de dados!")
    })

// -------------------------------------------------------------

var schemaTasks = new mongoose.Schema({
    title: String,
    description: String,
    type: String,
    date: Number,
    turma: String,
    matterId: String,
    id: {
        type: Number,
        default: 0
    },
    registerTime: {
        type: Number,
        default: null
    },
})

var schemaLogAlerts = new mongoose.Schema({
    name: String,
    value: Number,
    type: String,
    id: {
        type: Number,
        default: 0
    },
    registerTime: {
        type: Number,
        default: null
    },
})

var schemaUsers = new mongoose.Schema({
    fullname: String,
    email: String,
    password: {
        type: String,
        default: undefined
    },
    turma: {
        type: String,
        default: null
    },
    settings: {
        pushTasksCreated: {
            type: Boolean,
            default: false
        },
        pushTasksToday: {
            type: Boolean,
            default: true
        },
        pushTasks1Days: {
            type: Boolean,
            default: false
        },
        pushTasks2Days: {
            type: Boolean,
            default: false
        },
        pushTasks3Days: {
            type: Boolean,
            default: true
        },
        pushTasks4Days: {
            type: Boolean,
            default: false
        },
        pushTasks5Days: {
            type: Boolean,
            default: false
        },
        pushTasks6Days: {
            type: Boolean,
            default: false
        },
        pushTasks7Days: {
            type: Boolean,
            default: false
        },
        pushTasks10Days: {
            type: Boolean,
            default: false
        },
    },
    tasksAtribuidas: Number,
    tasksFeitas: Number,
    isTeacher: {
        type: Boolean,
        default: false
    },
    birth: {
        type: String,
        default: null
    },
    codeRegister: String,
    id: {
        type: Number,
        default: 0
    },
    registerTime: {
        type: Number,
        default: null
    },
})

var schemaMarkedTasks = new mongoose.Schema({
    id_task: String,
    id_user: String,
    timestamp: Number,
    id: {
        type: Number,
        default: 0
    },
    registerTime: {
        type: Number,
        default: null
    },
})

var schemaDevices = new mongoose.Schema({
    userId: String,
    email: String,
    profileId: String,
    id: {
        type: Number,
        default: 0
    },
    registerTime: {
        type: Number,
        default: null
    },
})

let schemaAppinfos = new mongoose.Schema({
    versions: {
        status: String,
        version: String,
        value: Number,
        text: String
    },
    school: {
        name: String,
    },
    registerTime: {
        type: Number,
        default: null
    },
})

let schemaSchools = new mongoose.Schema({
    school: String,
    email: String,
    codeStudent: String,
    codeTeacher: String,
    codePortal: String,
    registerTime: {
        type: Number,
        default: null
    },
})

// NOVOS DADOS
const schemaStudents = new mongoose.Schema({
    fullname: String,
    birth: {
        type: String,
        default: null
    },
    turma: String,
    tasksAtribuidas: {
        type: Number,
        default: 0
    },
    tasksFeitas: {
        type: Number,
        default: 0
    },
    settings: {
        pushTasksCreated: {
            type: Boolean,
            default: false
        },
        pushTasksToday: {
            type: Boolean,
            default: true
        },
        pushTasks1Days: {
            type: Boolean,
            default: false
        },
        pushTasks2Days: {
            type: Boolean,
            default: false
        },
        pushTasks3Days: {
            type: Boolean,
            default: true
        },
        pushTasks4Days: {
            type: Boolean,
            default: false
        },
        pushTasks5Days: {
            type: Boolean,
            default: false
        },
        pushTasks6Days: {
            type: Boolean,
            default: false
        },
        pushTasks7Days: {
            type: Boolean,
            default: false
        },
        pushTasks10Days: {
            type: Boolean,
            default: false
        },
    },
    isPunished: {
        type: Boolean,
        default: false
    },
    registerTime: {
        type: Number,
        default: null
    },

    email: {
        type: String,
        default: null
    },
    password: {
        type: String,
        default: null
    },

})

const schemaTeachers = new mongoose.Schema({
    fullname: String,
    birth: String,
    matterId: String,
    createdTasks: {
        type: Number,
        default: 0
    },
    email: {
        type: String,
        default: null
    },
    password: {
        type: String,
        default: null
    },
    registerTime: {
        type: Number,
        default: null
    },
})

const schemaClass = new mongoose.Schema({
    title: String,
    isReserved: {
        type: Boolean,
        default: false
    },
    registerTime: {
        type: Number,
        default: null
    },
})

const schemaMatter = new mongoose.Schema({
    title: String,
    registerTime: Number,
})

const schemaTokens = new mongoose.Schema({
    token: String,
    school: String,
    timestamp: Number,
    registerTime: {
        type: Number,
        default: null
    },
})


async function increment(next) {
    const doc = this;
    if (!doc.isNew) {
        return next();
    }

    try {
        //const lastUser = await this.constructor.findOne({}, {}, { sort: { id: -1 } });
        //const lastId = lastUser ? lastUser.id : 0;

        doc.registerTime = Date.now()
        //doc.id = lastId + 1;
        return next();
    } catch (error) {
        return next(error);
    }
}

schemaTasks.pre('save', increment)
schemaLogAlerts.pre('save', increment)
schemaUsers.pre('save', increment)
schemaMarkedTasks.pre('save', increment);
schemaDevices.pre('save', increment)
schemaAppinfos.pre('save', increment)

schemaSchools.pre('save', increment)
schemaStudents.pre('save', increment)
schemaTeachers.pre('save', increment)
schemaClass.pre('save', increment)
schemaTokens.pre('save', increment)
schemaMatter.pre('save', increment)

const modelTask = mongoose.model("Task", schemaTasks)
const modelLogAlerts = mongoose.model("LogAlert", schemaLogAlerts)
const modelMarkedTasks = mongoose.model('MarkedTask', schemaMarkedTasks);
const modelUsers = mongoose.model("User", schemaUsers)
const modelDevices = mongoose.model("Device", schemaDevices)
const modelAppinfos = mongoose.model("Appinfo", schemaAppinfos)

const modelStudents = mongoose.model("Student", schemaStudents)
const modelTeacher = mongoose.model("Teacher", schemaTeachers)
const modelClass = mongoose.model("Class", schemaClass)
const modelMatter = mongoose.model("Matter", schemaMatter)

//  GLOBAL
const modelSchools = mongoose.model("School", schemaSchools)
const modelTokens = mongoose.model("Token", schemaTokens)

// -------------------------------------------------------------

api.get("/", async (req, res) => {
    //console.log("RESET foi chamado")

    return res.status(200).json({ result: "Sucess" })
})

// |||||====||||| tarefas |||||====|||||

api.get("/tasks", async (req, res) => {
    let items = await modelTask.find()

    return res.status(200).json(items)
})

api.get("/tasks/one", async (req, res) => {
    var contentFind = req.body
    if (Object.keys(contentFind).length === 0) {
        contentFind = req.query
    }

    if (contentFind.title) {
        let taskSearch = await modelTask.findOne({ title: contentFind.title })
        return res.status(200).json(taskSearch)
    } else if (contentFind.description) {
        let taskSearch = await modelTask.findOne({ description: contentFind.description })
        return res.status(200).json(taskSearch)
    } else if (contentFind.type) {
        let taskSearch = await modelTask.findOne({ type: contentFind.type })
        return res.status(200).json(taskSearch)
    } else if (contentFind.date) {
        let taskSearch = await modelTask.findOne({ date: contentFind.date })
        return res.status(200).json(taskSearch)
    } else if (contentFind.turma) {
        let taskSearch = await modelTask.findOne({ turma: contentFind.turma })
        return res.status(200).json(taskSearch)
    } else {
        return res.status(400).json(null)
    }
})

api.get("/tasks/several", async (req, res) => {
    var contentFind = req.body
    if (Object.keys(contentFind).length === 0) {
        contentFind = req.query
    }

    if (contentFind.title) {
        let taskSearch = await modelTask.find({ title: contentFind.title })
        return res.status(200).json(taskSearch)
    } else if (contentFind.description) {
        let taskSearch = await modelTask.find({ description: contentFind.description })
        return res.status(200).json(taskSearch)
    } else if (contentFind.type) {
        let taskSearch = await modelTask.find({ type: contentFind.type })
        return res.status(200).json(taskSearch)
    } else if (contentFind.date) {
        let taskSearch = await modelTask.find({ date: contentFind.date })
        return res.status(200).json(taskSearch)
    } else if (contentFind.turma) {
        let taskSearch = await modelTask.find({ turma: contentFind.turma })
        return res.status(200).json(taskSearch)
    } else if (contentFind.dateMin) {
        let taskSearch = await modelTask.find({ date: { $gt: contentFind.dateMin - 1 } })
        return res.status(200).json(taskSearch)
    } else {
        return res.status(400).json(null)
    }
})

api.post("/tasks", async (req, res) => {
    let taskData = req.body

    let estruturaExemplo = {
        title: "",
        description: "",
        type: "",
        date: 0,
        turma: "",
    }

    let taskSend = {
        title: taskData.title,
        description: taskData.description,
        type: taskData.type,
        date: taskData.date,
        turma: taskData.turma
    }

    try {
        await modelUsers.updateMany({ turma: taskData.turma }, { $inc: { tasksAtribuidas: taskData.score || +1 } })
        new modelTask(taskSend).save()
            .then((data) => { return res.status(200).json(data) })
    }
    catch (error) {
        console.error(error)
        return res.status(200).json(error)
    }

    /* DADOS NECESSÁRIOS:
    turma - STRING - turma dos usuarios que deseja adicionar o valor de tarefas atribuidas
    score - NUMBER - quantidade da vlor a modificar (opcional)
    */
})

api.delete("/tasks", async (req, res) => {
    var contentFind = req.body
    if (Object.keys(contentFind).length === 0) {
        contentFind = req.query
    }

    var taskSearch = await modelTask.findOne(contentFind)
    if (!taskSearch) {
        return res.status(200).json(null)
    }

    let idDelete = taskSearch?.id
    if (!idDelete) return res.status(200).json(null)

    modelTask.deleteOne({ id: idDelete })
        .then((data) => { return res.status(200).json(data) })
        .catch((err) => { return res.status(200).json(err) })
})

api.put("/tasks", async (req, res) => {
    var contentFind = req.body
    if (Object.keys(contentFind).length === 0) {
        contentFind = req.query
    }
    if (contentFind?.params) {
        contentFind = contentFind.params
    }

    await modelTask.findOneAndUpdate({ _id: contentFind._id }, { $set: contentFind })
        .then((data) => { res.status(200).json(data) })
        .catch((err) => { res.status(400).json(err) })
})

// |||||====||||| ------- |||||====|||||

// |||||====||||| usuarios |||||====|||||
api.get("/users/verify", async (req, res) => {
    let userData = req.body

    if (!userData) {
        return res.status(400).json({ message: "Nenhum dado para busca foi passado." })
    }

    let usersFind = await modelUsers.find({
        $or: [
            { fullname: userData.fullname },
            { email: userData.email }
        ]
    });
    let userFind = usersFind[0] || null

    if (userFind) {
        return res.status(200).json({
            permission: false,
            userExisting: userFind
        })
    } else {
        return res.status(200).json({
            permission: true
        })
    }

})

api.get("/users", async (req, res) => {
    let userData = req.query

    await modelUsers.findOne(userData)
        .then((data) => { return res.status(200).json(data) })
        .catch((err) => { return res.status(400).json(err) })
})

api.get("/users/several", async (req, res) => {
    var contentFind = req.body
    if (Object.keys(contentFind).length === 0) {
        contentFind = req.query
    }
    if (contentFind?.params) {
        contentFind = contentFind.params
    }

    await modelUsers.find(contentFind)
        .then((data) => { res.status(200).json(data) })
        .catch((err) => { res.status(400).json(err) })
})

api.post("/users", async (req, res) => {
    let userData = req.body?.params

    let modeloUserData = {
        fullname: "",
        email: "",
        password: "",
        turma: "" // 1MA 1MB 1MC | 2MA 2MB 2MC | 3MA 3MB 3MC
    }

    let userDaTurma = await modelUsers.findOne({ turma: userData.turma })

    let modelSendUser = {
        fullname: userData.fullname || "",
        email: userData.email || "",
        password: userData.password || "",
        turma: userData.turma || null,
        tasksAtribuidas: userDaTurma?.tasksAtribuidas || 0,
        tasksFeitas: 0
    }

    new modelUsers(modelSendUser).save()
        .then((data) => { return res.status(200).json(data) })
        .catch((err) => { return res.status(400).json(err) })

})

api.put("/users", async (req, res) => {
    let data = req.body?.params

    await modelUsers.findOneAndUpdate({ _id: data._id }, { $set: data })
        .then((data) => { res.status(200).json(data) })
        .catch((err) => { res.status(400).json(err) })
})

// |||||====||||| ------- |||||====|||||

// |||||====||||| professor |||||====|||||
api.get("/teachers", async (req, res) => {

})

api.post("/teachers", async (req, res) => {
    let data = req.body
    console.log(req.body)

    async function generateUniqueCode(length) {
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        let code;
        let codesDB = await modelUsers.find()
        let listProfs = codesDB.filter(user => user.isTeacher == true)
        let usedCodes = listProfs.map(user => user.codeRegister)

        do {
            code = ''; // Inicializa o código como uma string vazia
            for (let i = 0; i < length; i++) {
                const randomIndex = Math.floor(Math.random() * characters.length);
                code += characters[randomIndex];
            }
        } while (usedCodes.includes(code)); // Verifica se o código já foi usado

        return code;
    }
    let code = await generateUniqueCode(6)

    let modelSendTeacher = {
        fullname: data.fullname || "",
        email: data.email || "",
        isTeacher: true,
        birth: data.birth || "",
        codeRegister: code,
    }

    const partesDoNome = data.fullname.split(" ");
    const primeiroNome = partesDoNome[0];

    transporter.sendMail({
        from: accoutEmail.email,
        to: data.email,
        subject: "Código de Registro - AP",
        html: `<html>
        <body>
            <div style="
                background-color: #111c49;
                height: 100px;
                display: flex;
                justify-content: center;
                align-items: center;
                padding: 15px 0px 15px 0px;
                ">
                <img src="https://imgur.com/hA1duEU.png" alt="logo patrus" style="
                height: 70px;
                margin-right: 40px;
            " />
                <h1 style="
                color: #fff;
            ">Agenda Patrus</h1>
            </div>
        
            <div style="
                border-top-width: 20px;
                border-top-color: #073ACE;
                padding: 0px 10px 0px 10px;
                ">
                <div style="padding: 20px;">
                    <h2 style="
                        color: black;
                        text-align: center;
                        font-size: 30px;
                        margin-top: 10px;
                        margin-bottom: 30px;
                        ">Olá <span
                            style="font-weight: bolder; color: black;">${primeiroNome || "professor(a)"}</span>!</h2>
        
                    <p style="margin: 10px 0px 20px 0px;">O seu código único de registro para professores no aplicativo Agenda Patrus serve
                        como forma segura para
                        que as contas de professores e secretários da escola sejam criadas evitando com que alunos mal
                        intencionados tenham acesso a funções exclusivas.</p>
        
                    <p style="margin: 10px 0px 30px 0px;">Para criar a sua conta de professor basta seguir os passos a seguir:</p>
        
                    <h3>1. Abrir a página de login para professor</h3>
                    <p style="margin: 5px 0px 30px 0px;">Ao entrar no App clique em "Sou professor(a)".</p>
        
                    <h3>2. Colocar o seu código de registro</h3>
                    <p style="margin: 5px 0px 30px 0px;">No campo de "Código de Registro" coloque o seu código que foi gerado e está no final
                        deste e-mail e no
                        comprovante de solicitação de registro obtido com o administrador do App (Joás do 2MB). Após, clique no
                        botão "Prosseguir".</p>
        
                    <h3>3. Crie uma senha</h3>
                    <p style="margin: 5px 0px 30px 0px;">Confirme se seus dados estão corretos e crie uma senha para a sua conta.
        
                        ATENÇÃO: Ao acessar sua conta será requisitado seu e-mail escolar e essa senha que você estará definido
                        nessa etapa, por tanto não se esqueça dela!
        
                        As senhas são salva no banco de dados do Agenda Patrus usando as tecnologias de criptografias de padrão
                        CHA256, CHA512 ou AES, sendo assim nem o administrador geral do App tem acesso a sua senha e não podendo
                        vê-la para lhe informar em caso de esquecimento. Após, clique em "Criar conta".</p>
        
                    <h3>4. Pronto! Conta criada com sucesso</h3>
        
                </div>
                
                <div>
    
                <hr></hr>
    
                <div style="
        margin: 25px 0px 25px 0px;
            ">
                
            <p style="font-size: 14px; text-align: center;">O seu código único de registro é:</p>
            <h1 style="font-size: 40px; margin-top: 5px; text-align: center; text-decoration: underline;">${code || "Inválido (erro#)"}</h1>
            </div>
    
                <hr></hr>
        
                </div>
        
                <div style="padding: 20px;">
                    <p style="font-size: 12px; text-align: center;">Esse não é um e-mail enviado pela Secretária de Educação nem
                        pela gestão da E. E. Sebastião Patrus de Souza</p>
                </div>
            </div>
        </body>
        
        <style>
            * {
                font-family: Arial, Helvetica, sans-serif;
                padding: 0px;
                margin: 0px;
                color: #555555;
            }
        
            p {
                margin: 0px;
            }
        
            h3 {
                margin: 0px;
            }
        </style>
        
        </html>`
    }, (error, info) => {
        if (error) {
            console.log('Erro ao enviar e-mail:', error);
        } else {
            console.log('E-mail enviado com sucesso:', info.response);
        }
    })

    new modelUsers(modelSendTeacher).save()
        .then((data) => { return res.status(200).json(modelSendTeacher) })
        .catch((err) => { return res.status(400).json(err) })
})

api.post("/emailtest", async (req, res) => {
    async function generateUniqueCode(length) {
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        let code;
        let codesDB = await modelUsers.find()
        let listProfs = codesDB.filter(user => user.isTeacher == true)
        let usedCodes = listProfs.map(user => user.codeRegister)

        do {
            code = ''; // Inicializa o código como uma string vazia
            for (let i = 0; i < length; i++) {
                const randomIndex = Math.floor(Math.random() * characters.length);
                code += characters[randomIndex];
            }
        } while (usedCodes.includes(code)); // Verifica se o código já foi usado

        return code;
    }
    let code = await generateUniqueCode(6)


})

api.post("/teachers/validate", async (req, res) => {

})

// |||||====||||| -------- |||||====|||||

// |||||====||||| tarefas concluídas |||||====|||||

api.get("/markedtasks/one", async (req, res) => {
    var contentFind = req.body
    if (Object.keys(contentFind).length === 0) {
        contentFind = req.query
    }

    if (contentFind.id_task) {
        let taskSearch = await modelMarkedTasks.findOne({ id_task: contentFind.id_task })
        return res.status(200).json(taskSearch)
    } else if (contentFind.id_user) {
        let taskSearch = await modelMarkedTasks.findOne({ id_user: contentFind.id_user })
        return res.status(200).json(taskSearch)
    } else if (contentFind.timestamp) {
        let taskSearch = await modelMarkedTasks.findOne({ timestamp: contentFind.timestamp })
        return res.status(200).json(taskSearch)
    } else if (contentFind.id) {
        let taskSearch = await modelMarkedTasks.findOne({ id: contentFind.id })
        return res.status(200).json(taskSearch)
    } else {
        return res.status(400).json(null)
    }
})

api.get("/markedtasks/several", async (req, res) => {
    var contentFind = req.body
    if (Object.keys(contentFind).length === 0) {
        contentFind = req.query
    }

    if (contentFind.id_task) {
        let taskSearch = await modelMarkedTasks.find({ id_task: contentFind.id_task })
        return res.status(200).json(taskSearch)
    } else if (contentFind.id_user) {
        let taskSearch = await modelMarkedTasks.find({ id_user: contentFind.id_user })
        return res.status(200).json(taskSearch)
    } else if (contentFind.timestamp) {
        let taskSearch = await modelMarkedTasks.find({ timestamp: contentFind.timestamp })
        return res.status(200).json(taskSearch)
    } else if (contentFind.id) {
        let taskSearch = await modelMarkedTasks.find({ id: contentFind.id })
        return res.status(200).json(taskSearch)
    } else if (contentFind._id) {

    } else {
        return res.status(400).json(null)
    }
})

api.post("/markedtasks", async (req, res) => {
    let taskData = req.body

    let taskMarkedExemplo = {
        id_task: 0, // id da tarefa
        id_user: 0, // id do usuario que marcou
        timestamp: 0, // data atual em milissegundos
        id: 0 // id do item que esta sendo criado...
    }

    let objectSend = {
        id_task: taskData.id_task,
        id_user: taskData.id_user,
        timestamp: Date.now()
    }



    new modelMarkedTasks(objectSend).save()
        .then(async (data) => {
            await modelUsers.findOneAndUpdate({ _id: taskData._id }, { $inc: { tasksFeitas: taskData.score || +1 } })
            return res.status(200).json(data)
        })
        .catch((err) => { return res.status(400).json(err) })

})

api.delete("/markedtasks", async (req, res) => {
    var contentFind = req.body
    if (Object.keys(contentFind).length === 0) {
        contentFind = req.query
    }

    //console.log(contentFind)
    var taskSearch = {}

    if (contentFind.id_task) {
        taskSearch = await modelMarkedTasks.findOne({ id_task: contentFind.id_task })
    } else if (contentFind.id_user) {
        taskSearch = await modelMarkedTasks.findOne({ id_user: contentFind.id_user })
    } else if (contentFind.timestamp) {
        taskSearch = await modelMarkedTasks.findOne({ timestamp: contentFind.timestamp })
    } else if (contentFind.id) {
        taskSearch = await modelMarkedTasks.findOne({ id: contentFind.id })
    } else if (contentFind._id) {
        taskSearch = await modelMarkedTasks.findOne({ _id: contentFind._id })
    } else {
        return res.status(400).json(null)
    }
    //console.log(taskSearch)

    let idDelete = taskSearch?._id
    if (!idDelete) return res.status(400).json(null)



    modelMarkedTasks.deleteOne({ id: idDelete })
        .then(async (data) => {
            await modelUsers.findOneAndUpdate({ _id: idDelete }, { $inc: { tasksFeitas: contentFind.score || -1 } })
            return res.status(200).json(data)
        })
        .catch((err) => { return res.status(400).json(err) })
})

// |||||====||||| ------------------ |||||====|||||

// |||||====||||| contagem de tarefas por user |||||====|||||
/*
api.get("/scores/taskscompleted", async (req, res) => {
    //  pega a contagem de tarefas feitas de um usuário
    let dataReq = req.body

    await modelUsers.findOne(dataReq)
        .then((data) => { res.status(200).json(data) })
        .catch((err) => { res.status(400).json(err) })

    /* DADOS NECESSÁRIOS:
    _id - STRING - ID padrão MongoDB do usuário desejado
})
*/

api.post("/scores/taskscompleted", async (req, res) => {
    //  adiciona +1 na contagem de tarefas feitas para um usuário
    let dataReq = req.body

    let dadosNecessarios = {
        score: dataReq.score || +1, // quantidade de contagem a modificar
        _id: "" // ID do usuário a modificar
    }

    await modelUsers.findOneAndUpdate({ _id: dataReq._id }, { $inc: { tasksFeitas: dataReq.score || +1 } })
        .then((data) => { res.status(200).json(data) })
        .catch((err) => { res.status(400).json(err) })
})

api.delete("/scores/taskscompleted", async (req, res) => {
    //  remove -1 na contagem de tarefas feitas para um usuário
    let dataReq = req.body

    let dadosNecessarios = {
        score: dataReq.score || -1, // quantidade de contagem a modificar
        _id: "" // ID do usuário a modificar
    }

    await modelUsers.findOneAndUpdate({ _id: dataReq._id }, { $inc: { tasksFeitas: dataReq.score || -1 } })
        .then((data) => { res.status(200).json(data) })
        .catch((err) => { res.status(400).json(err) })
})

//  USAR ISSO
api.put("/scores/taskscompleted", async (req, res) => {
    var contentFind = req.body
    if (Object.keys(contentFind).length === 0) {
        contentFind = req.query
    }


    let taskSearch = await modelMarkedTasks.findOne({ id_task: contentFind.task_id, id_user: contentFind.user_id })

    if (taskSearch) {
        //  DESMARCAR
        try {
            await modelMarkedTasks.findOneAndDelete({ _id: taskSearch._id })
            await modelUsers.findOneAndUpdate({ _id: contentFind.user_id }, { $inc: { tasksFeitas: contentFind.score || -1 } })
            return res.status(200).json("DERMARCADO")
        }
        catch (error) {
            return res.status(400).json(error)
        }
    } else {
        //  MARCAR
        let objectSend = {
            id_task: contentFind.task_id,
            id_user: contentFind.user_id,
            timestamp: Date.now()
        }

        try {
            new modelMarkedTasks(objectSend).save()
            await modelUsers.findOneAndUpdate({ _id: contentFind.user_id }, { $inc: { tasksFeitas: contentFind.score || +1 } })
            return res.status(200).json("MARCADO")
        }
        catch (error) {
            return res.status(400).json(error)
        }
    }

    /* DADOS NECESSÁRIOS:
    user_id - STRING - "_id" (padrão MongoDB) do usuário desejado
    task_id - STRING - "_id" (padrão MongoDB) da task desejada
    score - NUMBER - valor a modificar na contagem (opcional)
    */
})

/*
api.get("/scores/tasksassigned/user", async (req, res) => {
    //  pega a contagem de tarefas atribuidas para UM usuário
    let dataReq = req.body

    await modelUsers.findOne({ _id: dataReq._id })
        .then((data) => { res.status(200).json(data) })
        .catch((err) => { res.status(400).json(err) })

    /* DADOS NECESSÁRIOS:
    _id - STRING - ID padrão MongoDB do usuário desejado
})
*/

api.post("/scores/tasksassigned/users", async (req, res) => {
    //  adiciona +1 na contagem de tarefas atribuidas para TODOS usuários de uma turma
    let dataReq = req.body

    await modelUsers.updateMany({ turma: dataReq.turma }, { $inc: { tasksAtribuidas: dataReq.score || +1 } })
        .then((data) => { res.status(200).json(data) })
        .catch((err) => { res.status(400).json(err) })

    /* DADOS NECESSÁRIOS:
    turma - STRING - turma dos usuarios que deseja adicionar o valor de tarefas atribuidas
    score - NUMBER - quantidade da vlor a modificar (opcional)
    */
})

api.delete("/scores/tasksassigned/users", async (req, res) => {
    //  remove -1 na contagem de tarefas atribuidas para TODOS usuários de uma turma
    let dataReq = req.body

    await modelUsers.updateMany({ turma: dataReq.turma }, { $inc: { tasksAtribuidas: dataReq.score || -1 } })
        .then((data) => { res.status(200).json(data) })
        .catch((err) => { res.status(400).json(err) })

    /* DADOS NECESSÁRIOS:
    turma - STRING - turma dos usuarios que deseja adicionar o valor de tarefas atribuidas
    score - NUMBER - quantidade da vlor a modificar (opcional)
    */
})

// |||||====||||| ------------------ |||||====|||||



// |||||====||||| dispositivos |||||====|||||

api.get("/devices", async (req, res) => {
    let resp = await modelDevices.find()

    return res.status(200).json(resp)
})

api.post("/devices", async (req, res) => {
    let deviceData = req.body

    let modelSendDevice = {
        userId: deviceData.userId,
        email: deviceData.email || "",
    }

    new modelDevices(modelSendDevice).save()
        .then((data) => { return res.status(200).json(data) })
        .catch((err) => { return res.status(400).json(err) })

})

api.put("/devices", async (req, res) => {
    var contentFind = req.body
    if (Object.keys(contentFind).length === 0) {
        contentFind = req.query
    }
    if (contentFind?.params) {
        contentFind = contentFind.params
    }

    await modelDevices.findOneAndUpdate({ userId: contentFind.deviceId }, { $set: contentFind })
        .then((data) => { res.status(200).json(data) })
        .catch((err) => { res.status(400).json(err) })
})

// |||||====||||| ------------------ |||||====|||||

// |||||====||||| cryptografia |||||====|||||

api.post("/crypto", async (req, res) => {
    var dataString = req.body.crypto
    let key = appData.cryptoKey

    let cryptoProcess = crypto.AES.encrypt(dataString, key)
    let cryptoString = cryptoProcess.toString()
    return res.status(200).json({ cryptoString })
})

api.get("/crypto", async (req, res) => {
    var dataString = req.query.crypto
    let key = appData.cryptoKey

    let cryptoProcess = crypto.AES.decrypt(dataString, key)
    let cryptoString = cryptoProcess.toString(crypto.enc.Utf8)
    return res.status(200).json({ cryptoString })
})

/*

    let usersFind = await modelUsers.find({
        $or: [
            { fullname: userData.fullname },
            { email: userData.email }
        ]
    });

api.put("/markedtasks", async (req, res) => {
    let allTasks = await modelTask.find()
    let contagem = 0
    allTasks.map(async (task) => {
        console.log(task._id)
        contagem++
        await modelTask.findOneAndUpdate({ _id: task._id }, { $set: { id: contagem }})
            .then((data) => { res.status(200).json({ result: "Sucess", item: task.title, newId: contagem }) })
            .catch((err) => { res.status(400).json(err) })
    })

})

*/

/*
api.post("/addnewvalues", async (req, res) => {
    await modelUsers.updateMany({}, { $set: { tasksAtribuidas: 0, tasksFeitas: 0 } })
        .then((data) => { res.status(200).json(data) })
        .catch((err) => { res.status(400).json(err) })
})
*/

// |||||====||||| ------- |||||====|||||

// |||||====||||| outros |||||====|||||

//  /app/version
api.get("/app/version", async (req, res) => {
    let dataApp = await modelAppinfos.findOne({})

    let dadosVersion = {
        status: dataApp.versions.status,
        version: dataApp.versions.version,
        value: dataApp.versions.value,
        text: dataApp.versions.text

    }

    return res.status(200).json(dadosVersion)
})




//  VERSÃO 1.1.0
//  Registro de Estudante
api.post("/adm/register/student", async (req, res) => {
    //  ADM registrar UM ALUNO

    let modeloDados = {
        fullname: "",
        birth: "",
        turma: "",
    }
    //==============================
    let dataStudent = req.body

    if (!dataStudent.fullname || !dataStudent.birth || !dataStudent.turma) {
        return res.status(400).send({ error: true, response: "Existe dados faltando!" })
    }

    let newConection = mongoose.createConnection(appData.api.databaseURL, { useNewUrlParser: true, useUnifiedTopology: true, dbName: req.header("School") })
    let newModelStudent = newConection.model("Student", schemaStudents)

    new newModelStudent(dataStudent).save()
        .then((data) => {
            res.send(data)
        })
        .catch((err) => {
            res.status(400).send({ error: true, response: err })
        })
})

api.post("/adm/register/students", upload.single("file"), async (req, res) => {
    //  ADM registrar VÁRIOS ALUNOS
    let modeloDados = {
        fullname: "",
        birth: "",
        turma: "",
        RA: "", // OPCIONAL
    }
    //==============================
    if (!req.file) {
        return res.status(400).json({ error: true, response: "Nenhum arquivo foi enviado!" })
    }

    const buffer = req.file.buffer;
    const workbook = xlsx.read(buffer, { type: 'buffer' });

    let newConection = mongoose.createConnection(appData.api.databaseURL, { useNewUrlParser: true, useUnifiedTopology: true, dbName: req.header("School") })
    let newModelStudent = newConection.model("Student", schemaStudents)
    let newModelClass = newConection.model("Class", schemaClass)

    const planExcel = xlsx.utils.sheet_to_json(workbook.Sheets.Plan1)
    let errors = []
    let sucess = []
    await planExcel.forEach(async (dataStudent) => {
        if (!dataStudent.Nome || !dataStudent.Nascimento || !dataStudent.Turma) {
            errors.push(dataStudent)
        } else {
            let newFormat = {
                fullname: dataStudent.Nome,
                birth: dataStudent.Nascimento,
                turma: dataStudent.Turma,
                RA: dataStudent.RA || null,
            }

            await newModelClass.findOne({ title: newFormat.turma })
                .then((turmaStudent) => {
                    if (!turmaStudent) {
                        new newModelClass({ title: newFormat.turma }).save()
                    }
                })

            //  ARRUMAR ERRO AQUI

            new newModelStudent(newFormat).save()
            sucess.push(dataStudent)
        }


    })

    res.send({ sucess, errors })
})




//  VERSÃO 1.1.1
api.get("/adm/log", async (req, res) => {
    // todas as modificações no BANCO DE DADOS da ESCOLA será buscado com esse comando
})

api.post("/adm/log", async (req, res) => {
    // NOVAS modificações no BANCO DE DADOS da ESCOLA será registrado com esse comando
})


api.post("/code/students", async (req, res) => {
    // PEGAR o código de liberação do app da ESCOLA de alunos || Verificar se o código passado está correto
})

api.post("/code/teachers", async (req, res) => {
    // PEGAR o código de liberação do app da ESCOLA de PROFESSORES || Verificar se o código passado está correto
})

api.post("/code/portal", async (req, res) => {
    // PEGAR o código de liberação do app do PORTAL da SECRETARIA da ESCOLA || Verificar se o código passado está correto    
    let { codeClient } = req.body

    let dataFound = await modelSchools.findOne({ codePortal: codeClient })
    if (!dataFound) {
        return res.json(null)
    } else {
        return res.json(dataFound?.school)
    }
})

api.post("/adm/login", async (req, res) => {
    let { nameSchool } = req.body

    const schoolsTokens = await modelTokens.find()
    const tokensLimited = schoolsTokens.filter(token => Date.now() > token.timestamp + 1000 * 60 * 60 * 24 * 30 * 3)
    tokensLimited.map(async (item) => {
        await modelTokens.findByIdAndDelete(item._id)
    })

    const newData = {
        token: v4(),
        school: nameSchool,
        timestamp: Date.now()
    }

    new modelTokens(newData).save()
        .then((resp) => {
            res.json(newData)
        })
        .catch((err) => {
            res.status(400).json(err)
        })
})

api.post("/adm/token", async (req, res) => {
    const { token } = req?.body
    console.log(token)

    let result = await modelTokens.findOne({ token })
    res.json(result)
})

api.post("/adm/token-register", async (req, res) => {
    const { school, token } = req?.body
    console.log(school, token)

    new modelTokens({ school, token }).save()
        .then((resp) => {
            res.json(resp)
        })
        .catch((err) => {
            res.status(400).json(err)
        })
})


api.get("/register/student", async (req, res) => {

})

api.post("/register/student", async (req, res) => {

})


api.get("/register/teacher", async (req, res) => {

})

api.post("/register/teacher", async (req, res) => {

})


api.get("/register/class", async (req, res) => {

})

api.post("/register/class", async (req, res) => {

})


api.get("/register/matter", async (req, res) => {

})

api.post("/register/matter", async (req, res) => {
    let token = req.header("Authorization")
    console.log(token)

    res.json(token)
})



api.get("/search/students", async (req, res) => {
    let valueSearch = req.query?.valueSearch || ""
    let filter = req.query?.filter || ""

    let newConection = mongoose.createConnection(process.env.DATABASE_URL, { useNewUrlParser: true, useUnifiedTopology: true, dbName: req.header("School") })
    let modelStudents = newConection.model("Student", schemaStudents)

    let finded = []

    if (filter) {
        if (filter == "NAME") {
            finded = await modelStudents.find({ fullname: { $regex: valueSearch, $options: 'i' } })
        } else if (filter == "CLASS") {
            finded = await modelStudents.find({ turma: { $regex: valueSearch, $options: 'i' } })
        } else {
            finded = await modelStudents.find({
                $or: [
                    { fullname: { $regex: valueSearch, $options: 'i' } },
                    { turma: { $regex: valueSearch, $options: 'i' } }
                ]
            })
        }
    } else {
        finded = await modelStudents.find({
            $or: [
                { fullname: { $regex: valueSearch, $options: 'i' } },
                { turma: { $regex: valueSearch, $options: 'i' } }
            ]
        })
    }

    res.json(finded)
})



api.post("/adm/actions/student-punish", async (req, res) => {
    const student = req.body

    let newConection = mongoose.createConnection(process.env.DATABASE_URL, { useNewUrlParser: true, useUnifiedTopology: true, dbName: req.header("School") })
    let model = newConection.model("Student", schemaStudents)
    await model.findByIdAndUpdate(student._id, { isPunished: true })
        .then((resp) => {
            res.json(resp)
        })
        .catch((erro) => {
            res.status(400).json(erro)
        })
})

api.post("/adm/actions/student-unpunish", async (req, res) => {
    const student = req.body

    let newConection = mongoose.createConnection(process.env.DATABASE_URL, { useNewUrlParser: true, useUnifiedTopology: true, dbName: req.header("School") })
    let model = newConection.model("Student", schemaStudents)
    await model.findByIdAndUpdate(student._id, { isPunished: false })
        .then((resp) => {
            res.json(resp)
        })
        .catch((erro) => {
            res.status(400).json(erro)
        })
})

api.put("/adm/actions/student", async (req, res) => {
    const dataModify = req.body

    let newConection = mongoose.createConnection(process.env.DATABASE_URL, { useNewUrlParser: true, useUnifiedTopology: true, dbName: req.header("School") })
    let model = newConection.model("Student", schemaStudents)
    await model.findByIdAndUpdate(dataModify._id, dataModify)
        .then((resp) => {
            res.json(resp)
        })
        .catch((erro) => {
            res.status(400).json(erro)
        })
})

api.delete("/adm/actions/student", async (req, res) => {
    const idStudent = req.query?.idStudent

    let newConection = mongoose.createConnection(process.env.DATABASE_URL, { useNewUrlParser: true, useUnifiedTopology: true, dbName: req.header("School") })
    let model = newConection.model("Student", schemaStudents)
    await model.findByIdAndDelete(idStudent)
        .then((resp) => {
            res.json(resp)
        })
        .catch((erro) => {
            res.status(400).json(erro)
        })
})

api.post("/adm/actions/student", async (req, res) => {
    const student = req.body

    let newConection = mongoose.createConnection(process.env.DATABASE_URL, { useNewUrlParser: true, useUnifiedTopology: true, dbName: req.header("School") })
    let model = newConection.model("Student", schemaStudents)

    new model(student).save()
        .then((resp) => {
            res.json(resp)
        })
        .catch((erro) => {
            res.status(400).json(erro)
        })
})

api.post("/adm/actions/student-resetpassword", async (req, res) => {
    const student = req.body

    try {
        let newConection = mongoose.createConnection(process.env.DATABASE_URL, { useNewUrlParser: true, useUnifiedTopology: true, dbName: req.header("School") })
        let model = newConection.model("Student", schemaStudents)

        model.findByIdAndUpdate(student?._id, {
            password: null
        }).then(result => {
            return res.json(result)
        })
    } catch (err) {
        return res.json(err)
    }
})

api.post("/adm/actions/student-add", async (req, res) => {
    const student = req.body

    try {
        let newConection = mongoose.createConnection(process.env.DATABASE_URL, { useNewUrlParser: true, useUnifiedTopology: true, dbName: req.header("School") })
        let model = newConection.model("Student", schemaStudents)

        new model({
            fullname: student?.fullname,
            turma: student?.turma,
            birth: null,
            email: null,
            password: null
        }).save()
            .then(result => {
                return res.json(result)
            })
    } catch (err) {
        return res.json(err)
    }
})

//==================== ADM - TURMAS ====================//
api.get("/adm/actions/class-search", async (req, res) => {
    let valueSearch = req.query?.valueSearch || ""

    try {
        let newConection = mongoose.createConnection(process.env.DATABASE_URL, { useNewUrlParser: true, useUnifiedTopology: true, dbName: req.header("School") })
        let newModelClass = newConection.model("Classes", schemaClass)

        let finded = await newModelClass.find()
        return res.json(finded || [])
    } catch (err) {
        return res.json(err)
    }
})

api.post("/adm/actions/class-add", async (req, res) => {
    const turma = req.body

    try {
        let newConection = mongoose.createConnection(process.env.DATABASE_URL, { useNewUrlParser: true, useUnifiedTopology: true, dbName: req.header("School") })
        let newModelClass = newConection.model("Classes", schemaClass)

        new newModelClass(turma).save()
            .then(result => {
                return res.json(result)
            })
    } catch (err) {
        return res.json(err)
    }
})

api.get("/adm/actions/class-students", async (req, res) => {
    let valueSearch = req.query?.class || ""
    console.log(req.header("School"))
    if (!req.header("School")) {
        return res.json("Header Null")
    }

    try {
        let newConection = mongoose.createConnection(process.env.DATABASE_URL, { useNewUrlParser: true, useUnifiedTopology: true, dbName: req.header("School") })
        let newModelStudent = newConection.model("Student", schemaStudents)

        let finded = await newModelStudent.find({ turma: valueSearch })
        return res.json(finded || [])
    } catch (err) {
        return res.json(err)
    }
})

api.get("/adm/actions/class-tasks", async (req, res) => {
    let valueSearch = req.query?.class || ""
    console.log(req.header("School"))
    if (!req.header("School")) {
        return res.json("Header Null")
    }

    try {
        let newConection = mongoose.createConnection(process.env.DATABASE_URL, { useNewUrlParser: true, useUnifiedTopology: true, dbName: req.header("School") })
        let newModelTasks = newConection.model("Task", schemaTasks)

        let finded = await newModelTasks.find({ turma: valueSearch })
        return res.json(finded || [])
    } catch (err) {
        return res.json(err)
    }
})

api.post("/adm/actions/class-reserved", async (req, res) => {
    let valueSearch = req.body
    console.log(valueSearch)
    if (!req.header("School")) {
        return res.json("Header Null")
    }

    try {
        let newConection = mongoose.createConnection(process.env.DATABASE_URL, { useNewUrlParser: true, useUnifiedTopology: true, dbName: req.header("School") })
        let newModelClass = newConection.model("Classes", schemaClass)

        let classState = await newModelClass.findById(valueSearch?.id)

        await newModelClass.findByIdAndUpdate(valueSearch?.id, {
            isReserved: !classState?.isReserved
        })
            .then((resp) => {
                return res.json(resp)
            })
            .catch((err) => {
                return res.status(400).json(err)
            })
    } catch (err) {
        return res.json(err)
    }
})


api.delete("/adm/actions/class-delete", async (req, res) => {
    let valueSearch = req.body

    if (!req.header("School")) {
        return res.json("Header Null")
    }

    try {
        let newConection = mongoose.createConnection(process.env.DATABASE_URL, { useNewUrlParser: true, useUnifiedTopology: true, dbName: req.header("School") })
        let newModelClass = newConection.model("Classes", schemaClass)

        await newModelClass.findByIdAndDelete(valueSearch?.id)
            .then((resp) => {
                return res.json(resp)
            })
            .catch((err) => {
                return res.status(400).json(err)
            })
    } catch (err) {
        return res.json(err)
    }
})

//==================== ADM - MATERIAS ====================//
api.get("/adm/actions/matter-search", async (req, res) => {
    let valueSearch = req.query?.valueSearch || ""

    try {
        let newConection = mongoose.createConnection(process.env.DATABASE_URL, { useNewUrlParser: true, useUnifiedTopology: true, dbName: req.header("School") })
        let newModelMatters = newConection.model("Matters", schemaMatter)

        let finded = await newModelMatters.find({})
        return res.json(finded || [])
    } catch (err) {
        return res.json(err)
    }
})

api.post("/adm/actions/matter-add", async (req, res) => {
    const matter = req.body

    try {
        let newConection = mongoose.createConnection(process.env.DATABASE_URL, { useNewUrlParser: true, useUnifiedTopology: true, dbName: req.header("School") })
        let newModelMatter = newConection.model("Matter", schemaMatter)

        new newModelMatter(matter).save()
            .then(result => {
                return res.json(result)
            })
    } catch (err) {
        return res.json(err)
    }
})

api.put("/adm/actions/matter-edit", async (req, res) => {
    const dataEdit = req.body

    try {
        let newConection = mongoose.createConnection(process.env.DATABASE_URL, { useNewUrlParser: true, useUnifiedTopology: true, dbName: req.header("School") })
        let newModelMatter = newConection.model("Matter", schemaMatter)

        await newModelMatter.findByIdAndUpdate(dataEdit?.id, dataEdit?.update)
            .then(result => {
                return res.json(result)
            })
    } catch (err) {
        return res.json(err)
    }
})

api.get("/adm/actions/matter-teachers", async (req, res) => {
    let valueSearch = req.query?.matterId || ""
    console.log(req.header("School"))
    if (!req.header("School")) {
        return res.json("Header Null")
    }

    try {
        let newConection = mongoose.createConnection(process.env.DATABASE_URL, { useNewUrlParser: true, useUnifiedTopology: true, dbName: req.header("School") })
        let newModelTeacher = newConection.model("Teacher", schemaTeachers)

        let finded = await newModelTeacher.find({ matterId: valueSearch })
        return res.json(finded || [])
    } catch (err) {
        return res.json(err)
    }
})

api.get("/adm/actions/matter-tasks", async (req, res) => {
    let valueSearch = req.query?.matterId || ""
    console.log(valueSearch)
    if (!req.header("School")) {
        return res.json("Header Null")
    }

    try {
        let newConection = mongoose.createConnection(process.env.DATABASE_URL, { useNewUrlParser: true, useUnifiedTopology: true, dbName: req.header("School") })
        let newModelTasks = newConection.model("Task", schemaTasks)

        let finded = await newModelTasks.find({ matterId: valueSearch })
        console.log(finded)
        return res.json(finded || [])
    } catch (err) {
        return res.json(err)
    }
})

api.post("/adm/actions/matter-reserved", async (req, res) => {
    let valueSearch = req.body
    console.log(valueSearch)
    if (!req.header("School")) {
        return res.json("Header Null")
    }

    try {
        let newConection = mongoose.createConnection(process.env.DATABASE_URL, { useNewUrlParser: true, useUnifiedTopology: true, dbName: req.header("School") })
        let newModelClass = newConection.model("Classes", schemaClass)

        let classState = await newModelClass.findById(valueSearch?.id)

        await newModelClass.findByIdAndUpdate(valueSearch?.id, {
            isReserved: !classState?.isReserved
        })
            .then((resp) => {
                return res.json(resp)
            })
            .catch((err) => {
                return res.status(400).json(err)
            })
    } catch (err) {
        return res.json(err)
    }
})

api.delete("/adm/actions/matter-delete", async (req, res) => {
    let valueSearch = req.body

    if (!req.header("School")) {
        return res.json("Header Null")
    }

    try {
        let newConection = mongoose.createConnection(process.env.DATABASE_URL, { useNewUrlParser: true, useUnifiedTopology: true, dbName: req.header("School") })
        let newModelMatter = newConection.model("Matter", schemaMatter)

        await newModelMatter.findByIdAndDelete(valueSearch?.id)
            .then((resp) => {
                return res.json(resp)
            })
            .catch((err) => {
                return res.status(400).json(err)
            })
    } catch (err) {
        return res.json(err)
    }
})


//==================== ADM - PROFESSORES ====================//
// buscar professores com base no filtro enviado pelo cliente
api.get("/adm/actions/teacher", async (req, res) => {
    let valueSearch = req.query?.valueSearch || ""
    let filter = req.query?.filter || ""

    let newConection = mongoose.createConnection(process.env.DATABASE_URL, { useNewUrlParser: true, useUnifiedTopology: true, dbName: req.header("School") })
    let modelTeachers = newConection.model("Teacher", schemaTeachers)

    let finded = await modelTeachers.find({ fullname: { $regex: valueSearch, $options: 'i' } })

    res.json(finded)
})

// editar os dados de um professor
api.put("/adm/actions/teacher", async (req, res) => {
    const dataModify = req.body

    let newConection = mongoose.createConnection(process.env.DATABASE_URL, { useNewUrlParser: true, useUnifiedTopology: true, dbName: req.header("School") })
    let model = newConection.model("Teacher", schemaTeachers)

    await model.findByIdAndUpdate(dataModify._id, dataModify)
        .then((resp) => {
            res.json(resp)
        })
        .catch((erro) => {
            res.status(400).json(erro)
        })
})

// resetar a senha de um professor
api.post("/adm/actions/teacher-resetpassword", async (req, res) => {
    let user = req.body

    try {
        let newConection = mongoose.createConnection(process.env.DATABASE_URL, { useNewUrlParser: true, useUnifiedTopology: true, dbName: req.header("School") })
        let model = newConection.model("Teacher", schemaTeachers)

        model.findByIdAndUpdate(user?._id, {
            password: null
        }).then(result => {
            return res.json(result)
        })
    } catch (err) {
        return res.json(err)
    }
})

//  SEGUI MODELO vvvvvvvvvvvv TRY...CATCH
// apagar um professor do banco de dados
api.delete("/adm/actions/teacher", async (req, res) => {
    let idUser = req.query?.idUser

    try {
        let newConection = mongoose.createConnection(process.env.DATABASE_URL, { useNewUrlParser: true, useUnifiedTopology: true, dbName: req.header("School") })
        let model = newConection.model("Teacher", schemaTeachers)
        let resp = await model.findByIdAndDelete(idUser)
        return res.json(resp)
    } catch(erro) {
        return res.status(400).json(erro)
    }
})

// adicionar um professor ao banco de dados
api.post("/adm/actions/teacher", async (req, res) => {
    const user = req.body

    try {
        let newConection = mongoose.createConnection(process.env.DATABASE_URL, { useNewUrlParser: true, useUnifiedTopology: true, dbName: req.header("School") })
        let model = newConection.model("Teacher", schemaTeachers)
        let resp = await new model(user).save()
        return res.json(resp)
    } catch(erro) {
        return res.status(400).json(erro)
    }
})



//==================== ADM - OUTROS ====================//
api.get("/adm/tasks", async (req, res) => {
    let newConection = mongoose.createConnection(process.env.DATABASE_URL, { useNewUrlParser: true, useUnifiedTopology: true, dbName: req.header("School") })
    let modelTasks = newConection.model("Task", schemaTasks)

    let finded = await modelTasks.find()
    res.json(finded)
})



//==================== ADM - ESTATISTICAS ====================//
api.get("/statistics/tasks", async (req, res) => {
    let newConection = mongoose.createConnection(process.env.DATABASE_URL, { useNewUrlParser: true, useUnifiedTopology: true, dbName: req.header("School") })
    let modelTasks = newConection.model("Task", schemaTasks)

    let finded = await modelTasks.find()
    res.json(finded)
})



api.get("/adm/statistics/classWithMoreTasks", async (req, res) => {
    let newConectionn = mongoose.createConnection(process.env.DATABASE_URL, { useNewUrlParser: true, useUnifiedTopology: true, dbName: req.header("School") })
    let modelTasks = newConectionn.model("Task", schemaTasks)
    let dataTasks = await modelTasks.find() // Pega todas as tarefas do banco de dados da escola
    let totalTasks = dataTasks.length
    let tasks = dataTasks

    // Objeto para armazenar a contagem de tarefas por turma
    const tasksCountByTurma = {}
    // Percorra todas as tarefas e conte quantas existem para cada turma
    tasks.forEach(task => {
      const turma = task.turma
      if (tasksCountByTurma[turma]) {
        tasksCountByTurma[turma]++
      } else {
        tasksCountByTurma[turma] = 1
      }
    })
    // Encontre a turma com o maior número de tarefas
    let maxTasksTurma = null
    let maxTasksCount = 0

    Object.entries(tasksCountByTurma).forEach(([turma, count]) => {
      if (count > maxTasksCount) {
        maxTasksTurma = turma
        maxTasksCount = count
      }
    })

    let newConection = mongoose.createConnection(process.env.DATABASE_URL, { useNewUrlParser: true,
        useUnifiedTopology: true,
        dbName: req.header("School")
    })
        

    const percentage = (maxTasksCount / totalTasks) * 100

    return res.json({
        turma: maxTasksTurma, // Turma que mais tem tarefas.
        value: maxTasksCount, // Quantidade da matérias para a turma.
        percentage // Porcentagem em relação ao número total de tarefas.
    })
})



api.post("/school", async (req, res) => {
    let valueSearch = req.body
    let finded = await modelSchools.findOne(valueSearch)

    res.json(finded)
})