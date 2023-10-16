import { Markup } from 'telegraf'

const callbackButton = Markup.button.callback
var Mailer = {}, Mailing, bot, count = 0, delivered, notDelivered, inQueue, status = false

Mailer.connect = function (mailing, Bot) {
    Mailing = mailing
    bot = Bot
    setInterval(newTasksWatcher, 5000)
    newTasksWatcher()
    setInterval(handleTask, 50)
}
  
Mailer.add = function (uid, text) {
    Mailing.create({ uid, text, mm: false }).then()
    count++
}

Mailer.mm = async function (uid, ids, text, entities) {

    Mailing.insertMany(ids.map(id => ({ uid: id, text, mm: true, entities }))).then()
    count += ids.length
    inQueue = ids.length
    delivered = 0
    notDelivered = 0
    status = true
    let msg = await bot.telegram.sendMessage(uid, `
<b>✉️ Рассылка</b>\n
☑️ <b>Доставлено:</b> ${delivered} сообщений
✖️ <b>Не доставлено:</b> ${notDelivered} сообщений
🕒 <b>В очереди:</b> ${inQueue} сообщений
📶 <b>Прогресс:</b> ${Math.round(((delivered + notDelivered) / ids.length) * 100)}% 
    `, { parse_mode: 'html' })

    function updateStatsMsg() {
        bot.telegram.editMessageText(uid, msg.message_id, null,`
<b>✉️ Рассылка</b>\n
☑️ <b>Доставлено:</b> ${delivered} сообщений
✖️ <b>Не доставлено:</b> ${notDelivered} сообщений
🕒 <b>В очереди:</b> ${inQueue} сообщений
📶 <b>Прогресс:</b> ${Math.round(((delivered + notDelivered) / ids.length) * 100)}% 
            `,
            {
                parse_mode: 'html', ...Markup.inlineKeyboard([
                    inQueue ? [callbackButton('⏹ Стоп', `admin_mmStop`),
                    status ? callbackButton('⏸ Пауза', `admin_mmPause`) : callbackButton('▶️ Продолжить', `admin_mmResume`)
                    ] : [],
                ])
            }).then()
        if (status) setTimeout(updateStatsMsg, 1000)
    }
    setTimeout(updateStatsMsg, 1000)

    Mailer.stop = async function () {
        status = false
        inQueue = 0
        updateStatsMsg()
        await Mailing.deleteMany({ mm: true })
    }

    Mailer.pause = async function () {
        status = false
        updateStatsMsg()
    }

    Mailer.resume = async function () {
        status = true
        updateStatsMsg()
    }
}

async function newTasksWatcher() {
    count = await Mailing.countDocuments()
}

async function handleTask() {
    try {
        if (!count) return

        let task = await Mailing.findOne()
        if (!task) return count = 0
        await task.deleteOne()

        if (!task.mm) bot.telegram.sendMessage(task.uid, task.text, { parse_mode: 'html' }).then().catch()
        else {
            bot.telegram.sendMessage(task.uid, task.text, { entities: task.entities }).then(() => console.log(`uid=${task.uid} - del ${delivered++}`)).catch(() => console.log(`uid=${task.uid} - not del ${notDelivered++}`))
            if (--inQueue <= 0) status = false
        }

        count--
    }

    catch { }

}

export default Mailer