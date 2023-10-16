import { Telegraf, Markup } from 'telegraf';
import config from './config.js';
import { User, Mailing, Subscription, Setting } from './models.js';
import Mailer from './mailer.js'
import mongoose from 'mongoose';
import fs from 'fs';
import { CronJob } from 'cron';
import https from 'https';

const bot = new Telegraf(config.bot.token);
mongoose.connect(config.db.url, { useNewUrlParser: true, useUnifiedTopology: true });

function isAdmin(uid) { return config.admin.includes(uid)}
function sendAdmins(text, params) { for (var i = 0; i < config.admin.length; i++) bot.telegram.sendMessage(config.admin[i], text, params) }
function setData(user_id, dat) { User.findOneAndUpdate({ id: user_id }, { dat: String(dat) }).then((e) => { }) }
function setState(user_id, condition) { User.findOneAndUpdate({ id: user_id }, { condition: Number(condition) }).then((e) => { }) }
function generateRandomString(length) { let result = ''; const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'; const charactersLength = characters.length;for (let i = 0; i < length; i++) { result += characters.charAt(Math.floor(Math.random() * charactersLength));} return result;}
async function getUserById(userId) { const user = await User.findOne({ id: userId }); return user;}
function roundPlus(number) { if (isNaN(number)) return false; var m = Math.pow(10, 2); return Math.round(number * m) / m; }
async function payRefEarnings(user, sum) {
    if (user.ref != 0 && user.state == 0) {
        await User.findOneAndUpdate({ id: user.ref }, { $inc: { balance: sum, refCount: 1 } })
        await User.findOneAndUpdate({ id: user.id }, { $inc: { state: 1 } })
        bot.telegram.sendMessage(user.ref, `🤝 На Ваш баланс начислено <b>${roundPlus(sum)} TRX</b> за преглашение <a href="tg://user?id=${user.id}">партнёра</a> на <b>1 уровне</b>`, { parse_mode: 'html' })
    }
}

function getRandomValue() {
    const trxValues = [0.01, 0.01, 0.01, 0.01, 0.01, 0.1, 0.1, 0.1, 0.1, 0.1];
    const usdtValues = [0.01, 0.01, 0.01, 0.01, 0.01, 0.1, 0.1, 0.1, 0.1, 0.1];
    const tonValues = [0.01, 0.01, 0.01, 0.01, 0.01, 0.1, 0.1, 0.1, 0.1, 0.1];
    const randomIndex = Math.floor(Math.random() * 10);
    const randomCrypto = Math.floor(Math.random() * 3);
    let value;
    let crypto;

    if (randomCrypto === 0) {
        value = trxValues[randomIndex] * (Math.floor(Math.random() * (5 - 1 + 1)) + 1);
        crypto = "TRX";
    } else if (randomCrypto === 1) {
        value = usdtValues[randomIndex] * (Math.floor(Math.random() * (5 - 1 + 1)) + 1);
        crypto = "USDT";
    } else {
        value = tonValues[randomIndex] * (Math.floor(Math.random() * (5 - 1 + 1)) + 1);
        crypto = "TON";
    }

    return `${value} ${crypto}`;
}

async function main(uid) {
    const randomValue = getRandomValue();
    const value = randomValue.split(" ")[0];
    const crypto = randomValue.split(" ")[1];

    if (crypto === "TRX") {
        await User.findOneAndUpdate({ id: uid }, { $inc: { balance: value, attempts: -1 } });
        bot.telegram.sendMessage(uid, `🤝 На Ваш баланс начислено <b>${roundPlus(value)} ${crypto}</b>`, { parse_mode: 'html' })
    } else if (crypto === "USDT") {
        await User.findOneAndUpdate({ id: uid }, { $inc: { balance: value, attempts: -1 } });
        bot.telegram.sendMessage(uid, `🤝 На Ваш баланс начислено <b>${roundPlus(value)} ${crypto}</b>`, { parse_mode: 'html' })
    } else {
        await User.findOneAndUpdate({ id: uid }, { $inc: { balance: value, attempts: -1 } });
        bot.telegram.sendMessage(uid, `🤝 На Ваш баланс начислено <b>${roundPlus(value)} ${crypto}</b>`, { parse_mode: 'html' })
    }

    console.log(`Зачислено ${value} ${crypto} на баланс пользователя с id ${uid}.`);
}

let ok = [];
let bad = [];

Mailer.connect(Mailing, bot)

const callbackButton = Markup.button.callback;
const urlButton = Markup.button.url;
const BackMenu = (toCallback) => Markup.inlineKeyboard([[callbackButton('◀️ Назад', toCallback)]])

const mainKB = Markup.keyboard([
    ['Принять участие', 'Рандом'],
    [ '👤 Профиль', '📊 Статистика'],
]).resize();

const AdminMenu = Markup.inlineKeyboard([
    [callbackButton(`👤 Информация о пользователе`, `admin_userInfo`)],
    [callbackButton(`✉️ Рассылка`, `admin_mm`), callbackButton(`✉️ Рассылка с фото`, `admin_photo`)],
    [callbackButton(`⚙️ Настройка бота`, `admin_settings`)],
    [callbackButton(`👤 Проверка пользователей`, `admin_stauss`)],
    [callbackButton(`🔄 Перезапуск бота`, `admin_reboot`)],
]);

const infoKB = Markup.inlineKeyboard([
    [callbackButton(`📊 Статистика проекта`, `stats`)],
]);

const Ref = Markup.inlineKeyboard([
    [callbackButton(`🏆 Топ рефоводов`, `topRef`)],
]);

let cryptobot_token = '120559:AAvrjhz4XvsIeMbF423cxbgOaN2qSvcvl27'//122492:AAvMsQidDbsGBUG71GbCh5BGmwC1DVp4mEB

bot.use(async (ctx, next) => {
    let msg = ctx.message, data;
    if (!msg && ctx.callbackQuery) {
        msg = ctx.callbackQuery.message;
        data = ctx.callbackQuery.data;
    }
    if (!msg || !msg.chat || msg.chat.type != 'private')
        return;

    let u = await User.findOne({ id: msg.chat.id });
    if (!u) {
        u = await User.create({
            id: msg.chat.id,
            waitFor: '',
            data: {},
            ref: Number(msg.text.split(" ")[1]) || 0,
            refCount: 0,
            balance: 0, 
            ban: false,
            dat: '',
            earned: 0,
            condition: 0,
            state: 0,
            attempts: 3, 
            time: 0,
            st: 1
        })
        //if(u.ref) bot.telegram.sendMessage(u.ref, `<b>👤 У Вас новый <a href="tg://user?id=${u.id}">реферал</a></b>`, { parse_mode })
    }
    if(u.ban) return
    ctx.u = u;
    if (!u.data) u.data = {}
    return next();
})

bot.on(`text`, async (ctx) => {
    let uid = ctx.message.chat.id,
        text = ctx.message.text,
        msg = ctx.message,
        answer = async (text, keyboard) => { ctx.replyWithHTML(text, { ...keyboard, disable_web_page_preview: true }); u.updateOne({ waitFor: '' }).then() },
        askFor = (data, text, keyboard) => { answer(text, keyboard, true); u.updateOne({ waitFor: data }).then() },
        store = (fields) => { Object.keys(fields).forEach(key => u.data[key] = fields[key]); u.updateOne({ data: u.data }).then() },
        u = ctx.u,
        replyTo = u.waitFor

        const s = await Setting.findOne({ id: 0 })

    console.log(`${uid} отправил текст: ${text}`);

    var q = await Subscription.findOne({ id: 0 });
    var list = q.chats 
    var trig = false
    var unsubscribedChats = []
    for (const i in list) {
    try {
    if ((await bot.telegram.getChatMember(list[i].id, uid)).status == "left") {
    unsubscribedChats.push(list[i])
    trig = true
            }
        }
    catch{ }
    }
    if (trig && unsubscribedChats.length > 0) { 
    var kb = { inline_keyboard: [] }
    unsubscribedChats.map(e => { kb.inline_keyboard.push([{text: e.name, url: e.link}])})  
    kb.inline_keyboard.push([{ text: "✅ Я подписался", callback_data: `checkList`}])
    bot.telegram.sendMessage(uid, `❕ <b>Для использования бота, пожалуйста, подпишитесь на наши каналы:</b>`, { parse_mode: 'html', reply_markup: kb });
    return;
    }

    if (text.startsWith('/start')) {// - ${u.earned} TRX заработано
        return await answer(`<b>▪️ Приветствуем Вас в сервисе KING BEAR</b>`, mainKB);
    }

    if (text == 'Принять участие') {
        return await answer(`<b> ▪️ Вы можете заработать ${s.min_pay} TRX за каждого преглашенного друга!\n\n▪️ Ссылка для приглашения: https://t.me/king_bear_bot?start=${uid}\n\n👤 Ваши приглашённые:\n\n1 уровень - ${await User.countDocuments({ ref: uid })} партнёров</b>`, Ref)
    }

    if (text == '👤 Профиль') {
        return await answer(`<b> ▪️ Ваш ID: <code>${uid}</code>\n▪️ Ваш баланс: ${u.balance.toFixed(2)} TRX</b>`, Markup.inlineKeyboard([[callbackButton('Вывести', `payout`)]]))
    }

    if (text == '📊 Статистика') {
        return await answer(`📊 Статистика KING BEAR`, infoKB);
    }

    if (text == "/send" && isAdmin(uid)) {
        const sum = 90
        let pay_url = (await new Promise( (resolve, reject) => {
            let req = https.request({
                    host: 'pay.crypt.bot',
                    port: 443,
                    path: `/api/createInvoice?asset=TRX&amount=${sum}`,
                    method: 'GET',
                    headers: {
                        'Crypto-Pay-API-Token': cryptobot_token
                }
            }, (res) => {
                    res.setEncoding('utf8');
                    let response = "";
                    res.on('data', (data) => {
                        response += data;
                    });
                    res.on('end', (data) => {
                        resolve(JSON.parse(response));
                    });
                });
                req.on('error', (err) => {
                    console.log(err);
                });
                req.end();
            })).result.pay_url;
            console.log(pay_url)
            setState(uid, 0)
            bot.telegram.sendMessage(uid, `Чтобы пополнить баланс на ${sum} TRX, необходимо оплатить счёт по ссылке ${pay_url}`,{ parse_mode: 'html' });

        }

    if (text == '/info' && isAdmin(uid)) {
        const z = await User.find({});
        //await User.deleteMany()
        console.log(z)
    }

    if (text == '/getid' && isAdmin(uid)) {//id пользователей для botstat
        const usr = await User.find({ id: { $gt: 100 } });
        let ufile = '';
        for (let i = 0; i < usr.length; i++) {
            ufile += `${usr[i].id}\n`;
        }
        fs.writeFileSync('ufile.txt', ufile);
        bot.telegram.sendDocument(uid, { source: 'ufile.txt' }, { caption: 'Список юзеров готов.' });
    }

    if (text == 'Рандом') {
        if (u.attempts == 0) return await answer('Ошибка!');
        await main(uid)
    }

    if (text.startsWith('/goal')) {
        let bet = Number(text.split(' ')[1]);
        if (!bet || bet > u.balance) return await answer('Ошибка!');
        let game = await ctx.replyWithDice({emoji: '⚽'});
        setTimeout(async () => {
            if (game.dice.value >= 3) {
                await u.updateOne({ $inc: { balance: -bet } });
                await u.updateOne({ $inc: { balance: 2 * bet } });
                return await answer(`Вы победили! Вы получаете ${ 2 * bet }\n\nВаш баланс: ${u.balance} TRX`);
            } else {
                await u.updateOne({ $inc: { balance: -bet } });
                return await answer(`Неудача! Вы проигрываете ${bet}\n\nВаш баланс: ${u.balance} TRX`);
            }
        }, 3000); 
    }

    if (replyTo == 'pay') {
        const sum = Number(text)
        if (sum < 15) {
            return bot.telegram.sendMessage(uid, "❗️Введите сумму больше 15 TRX", { parse_mode: "html"});
        }
        if (isNaN(sum)) {
            return bot.telegram.sendMessage(uid, '❕ <b>Укажите число</b>\n\n👉 Введите сумму:', { parse_mode: "html"});
        }
        const options = {
            hostname: 'pay.crypt.bot',
            port: 443,
            path: '/api/transfer',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Crypto-Pay-API-Token': cryptobot_token
            }
          };
          const data = JSON.stringify({
            user_id: uid,
            asset: 'TRX',
            amount: sum,
            spend_id: generateRandomString(10),
            comment: 'Выплата с бота',
            disable_notification: false
          });
           const req = https.request(options, (res) => {
            console.log(`statusCode: ${res.statusCode}`);
          
            res.on('data', async (d) => {
              process.stdout.write(d);
                if (res.statusCode == 200) {
                    bot.telegram.sendMessage(uid, 'Перевод успешно отправлен', { parse_mode: "html"});
                    await User.findOneAndUpdate({ id: uid }, { $inc: { balance: - sum }})
                    await u.updateOne({waitFor: ''});
                } else {
                    if (res.statusCode == 400) {
                    bot.telegram.sendMessage(uid, 'Ошибка перевода!\n\nНедостаточно баланса TRX в приложении', { parse_mode: "html"});
                    await u.updateOne({waitFor: ''});
                    }
                }
            }) 
        });
          req.on('error', (error) => {
            console.error(error);
            bot.telegram.sendMessage(uid, 'Ошибка отправки перевода!', { parse_mode: "html"});
          });
          req.write(data);
          req.end();
    }

    else if (u.condition == 911 && isAdmin(uid) && text != "0") {
        setState(uid, 0)
        var btns = []
        var msgText = text
        var regex = /#([^#]+)#\s+(http[s]?:\/\/[^\s]+)\s+#/g
        var match = regex.exec(text)
        while (match != null) {
            var btn_text = match[1].trim()
            var btn_link = match[2].trim()
            btns.push({ text: btn_text, url: btn_link })
            msgText = msgText.replace(match[0], '')
            match = regex.exec(text)
        }
        bot.telegram.sendMessage(uid, "✅ <b>Рассылка запущена!</b>\n\n<b>Текст сообщения:</b>\n" + msgText.trim() + "\n\n<b>Клавиатура:</b>\n" + JSON.stringify(btns), { parse_mode: 'html' }).then((e) => {
        mm_t(msgText.trim(), e.message_id, e.chat.id, btns.length > 0 ? btns : false, 100, true)
        })
    }

    if (isAdmin(uid)) { // Админка
        if (text == '/a' || text == '/admin') {
    const h = Math.floor(process.uptime() / 3600);
    const m = Math.floor((process.uptime() - h * 3600) / 60);
    const s = Math.floor(process.uptime() - h * 3600 - m * 60);
    const heap = Math.floor(process.memoryUsage().rss / 1048576);
    const options = {
        hostname: 'pay.crypt.bot',
        port: 443,
        path: '/api/getBalance',
        method: 'GET',
        headers: {
          'Crypto-Pay-API-Token': cryptobot_token
        }
      };
      
      const req = https.request(options, async function (res) {
        let data = '';
      
        res.on('data', (chunk) => {
          data += chunk;
        });
      
        res.on('end', async function () {
          const response = JSON.parse(data);
          const balances = response.result;
          const tonBalance = balances.find(asset => asset.currency_code === 'TON');
          const usdtBalance = balances.find(asset => asset.currency_code === 'USDT');
          const trxBalance = balances.find(asset => asset.currency_code === 'TRX');
            return answer(`
<b>👨‍💻 Админ-панель:</b>
➖➖➖➖➖➖➖➖➖➖
<b>🔄 Аптайм бота:</b> ${h} часов ${m} минут ${s} секунд
<b>💾 Памяти использовано:</b> ${heap} МБ
<b>👤 Пользователей:</b> ${await User.countDocuments()}
<b>▪️ Баланс TON:</b> ${tonBalance.available} TON
<b>▪️ Баланс USDT:</b> ${usdtBalance.available} USDT
<b>▪️ Баланс TRX:</b> ${trxBalance.available} TRX`, AdminMenu);
                            });
                        });
                   req.on('error', (error) => {
                   console.error(error);
                });
            req.end();
        }

        if (replyTo == 'userId') {
            let user = await User.findOne({ id: text });
            if (user) {
                return answer(`👤 ID: <code>${user.id}</code>\n
Баланс: <b>${user.balance} TRX</b>
Партнёров: ${await User.countDocuments({ ref: user.id })} 
        `, Markup.inlineKeyboard([
                    [callbackButton('✏️ Изменить баланс', `admin_editBalance_${user.id}`), callbackButton('✏️ Добавить баланс', `admin_reditBalance_${user.id}`)],
                    [!user.ban ? callbackButton('✖️ Забанить', `admin_ban_${user.id}`): callbackButton('✔️ Разбанить', `admin_unban_${user.id}`) ],
                    [callbackButton('◀️ Назад', `admin_back`)]
                ]));
            } else {
                return answer(`Произошла ошибка!`, Markup.inlineKeyboard([[callbackButton('◀️ Назад', `admin_back`)]]));
            }
        }

        if (replyTo == 'newBalance') {
            console.log(u.dat)
            await User.updateOne({ id: u.dat }, { balance: Number(text) });
            answer(`Баланс успешно изменён на ${Number(text)} TRX!`, Markup.inlineKeyboard([[callbackButton('◀️ Назад', `admin_back`)]]));
            bot.telegram.sendMessage(u.dat, `Ваш баланс успешно изменён на ${Number(text)} TRX!`, { parse_mode })
        }

        if (replyTo == 'plusBalance') {
            console.log(u.dat)
            await User.updateOne({ id: u.dat }, { $inc: { balance: Number(text) } });
            answer(`Баланс успешно пополнен на ${Number(text)} TRX!`, Markup.inlineKeyboard([[callbackButton('◀️ Назад', `admin_back`)]]));
            bot.telegram.sendMessage(u.dat, `Ваш баланс успешно пополнен на ${Number(text)} TRX!`, { parse_mode })
        }

        if (replyTo == 'editminpay') {
            await Setting.findOneAndUpdate({ id: 0 }, { min_pay: Number(text) });
            answer(`Минимальная выплата за рефа изменена на ${Number(text)} TRX!`, Markup.inlineKeyboard([[callbackButton('◀️ Назад', `admin_back`)]]));
        }

        if (replyTo == 'editminout') {
            await Setting.findOneAndUpdate({ id: 0 }, { min_out: Number(text) });
            answer(`Минимальный вывод изменён на ${Number(text)} TRX!`, Markup.inlineKeyboard([[callbackButton('◀️ Назад', `admin_back`)]]));
        }

        if (replyTo == 'mm_text') {
            let users = await User.find({}, { id: 1 })
            Mailer.mm(uid, users.map(u => u.id), text, msg.entities)
            return answer(`✅ <b>Рассылка запущена</b>`, BackMenu('admin_back'))
        }

        if (u.condition == 567) {
            setState(uid, 0)
            var chats = text.split("\n").map((e) => { return { id: e.split(" ")[0].trim(), link: e.split(" ")[1].trim(), name: e.split(e.split(" ")[1])[1].trim() } })
            await Subscription.updateMany({},{ "chats": chats }).then()
            console.log(chats)
            return answer(`<b>Установлено ${chats.length} чатов/каналов для обязательной подписки при старте</b>!\n\n<b>Список чатов и каналов обновлен</b>!`, BackMenu('admin_back'))
        }
    }
})

bot.on('callback_query', async (ctx) => {
    try {
        let uid = ctx.callbackQuery.message.chat.id,
            popup = async (text) => ctx.answerCbQuery(text, { show_alert: true }),
            popu = async (text) => ctx.answerCbQuery(text),
            answer = async (text, keyboard) => { ctx.editMessageText(text, { parse_mode, ...keyboard, disable_web_page_preview: false }); u.updateOne({ waitFor: '' }).then() },
            askFor = (data, text, keyboard) => { answer(text, keyboard, true); u.updateOne({ waitFor: data }).then() },
            store = (fields) => { Object.keys(fields).forEach(key => u.data[key] = fields[key]); u.updateOne({ data: u.data }).then() },
            d = ctx.callbackQuery.data,
            u = ctx.u, parts = d.split('_')

            const s = await Setting.findOne({ id: 0 })
            const user = await getUserById(uid)

        console.log(`${uid} отправил колбэк: ${d}`);

        if (parts[0] == "checkList") {
            const sum = s.min_pay
            var q = await Subscription.findOne({ id: 0 });
            var list = q.chats
            var trig = false
            for (const i in list) {
                try {
                    if ((await bot.telegram.getChatMember(list[i].id, uid)).status == "left") trig = true
                }
                catch{ }
            }
            if (trig)
            return popup("❗️ Вы подписались не на все каналы или группы из списка")
            ctx.deleteMessage(ctx.message)
            bot.telegram.sendMessage(uid, '✅ Добро пожаловать в главное меню', { parse_mode: 'html', reply_markup: mainKB }); 
            await payRefEarnings(user, sum)
            console.log(user)
        }

        if (d == 'payout') {
            if (u.balance < s.min_out) return popup(`❗️У Вас недостаточно TRX на балансе для вывода.
Минимальная выплата: ${s.min_out} TRX`)
            return answer(`Выберите платёжную систему, для вывода TRX:`, Markup.inlineKeyboard([
                [callbackButton('@CryptoBot', `crypto`)]
            ]));
        }

        if (d == 'crypto') {
            return askFor(`pay`, `Введите сумму для вывода:`, Markup.inlineKeyboard([[callbackButton('◀️ Назад', `lk`)]]));
        }

        if (d == 'lk') {
            return await answer(`<b> ▪️ Ваш ID: <code>${uid}</code>\n▪️ Ваш баланс: ${u.balance.toFixed(2)} TRX</b>`, Markup.inlineKeyboard([[callbackButton('Вывести', `payout`)]]))
        }

        if (d == 'stats') {
            const date = new Date('2023-10-01');
            const milliseconds = date.getTime();   
            let t = new Date()
            t = t.getTime() - milliseconds
            var day = t / 86400000 ^ 0  
            return answer(`
📊 <b>Статистика проекта</b>
🕜 <b>Работаем дней:</b> ${day} 
👥 <b>Всего пользователей:</b> ${await User.countDocuments()}`)
        }

        if (parts[0] == 'admin') {
            if (parts[1] == 'back') {
                const h = Math.floor(process.uptime() / 3600);
    const m = Math.floor((process.uptime() - h * 3600) / 60);
    const s = Math.floor(process.uptime() - h * 3600 - m * 60);
    const heap = Math.floor(process.memoryUsage().rss / 1048576);
    const options = {
        hostname: 'pay.crypt.bot',
        port: 443,
        path: '/api/getBalance',
        method: 'GET',
        headers: {
          'Crypto-Pay-API-Token': cryptobot_token
        }
      };
      
      const req = https.request(options, async function (res) {
        let data = '';
      
        res.on('data', (chunk) => {
          data += chunk;
        });
      
        res.on('end', async function () {
          const response = JSON.parse(data);
          const balances = response.result;
          const tonBalance = balances.find(asset => asset.currency_code === 'TON');
          const usdtBalance = balances.find(asset => asset.currency_code === 'USDT');
          const trxBalance = balances.find(asset => asset.currency_code === 'TRX');
            return answer(`
<b>👨‍💻 Админ-панель:</b>
➖➖➖➖➖➖➖➖➖➖
<b>🔄 Аптайм бота:</b> ${h} часов ${m} минут ${s} секунд
<b>💾 Памяти использовано:</b> ${heap} МБ
<b>👤 Пользователей:</b> ${await User.countDocuments()}
<b>▪️ Баланс TON:</b> ${tonBalance.available} TON
<b>▪️ Баланс USDT:</b> ${usdtBalance.available} USDT
<b>▪️ Баланс TRX:</b> ${trxBalance.available} TRX`, AdminMenu);
                            });
                        });
                   req.on('error', (error) => {
                   console.error(error);
                });
            req.end();
        }

            if (parts[1] == 'userInfo') {
                return askFor(`userId`, `Введите id пользователя:`, Markup.inlineKeyboard([[callbackButton('◀️ Назад', `admin_back`)]]));
            }

            if (parts[1] == 'editBalance') {
                store({ editUser: parts[2] });
                setData(uid, Number(parts[2]))
                return  askFor(`newBalance`, `Введите сумму:`, Markup.inlineKeyboard([[callbackButton('◀️ Назад', `admin_back`)]]));
            }

            if (parts[1] == 'reditBalance') {
                store({ editUser: parts[2] });
                setData(uid, Number(parts[2]))
                return  askFor(`plusBalance`, `Введите сумму:`, Markup.inlineKeyboard([[callbackButton('◀️ Назад', `admin_back`)]]));
            }

            if (parts[1] == 'editBalancePay') {
                store({ editUser: parts[2] });
                setData(uid, Number(parts[2]))
                return  askFor(`editminpay`, `Введите сумму:`, Markup.inlineKeyboard([[callbackButton('◀️ Назад', `admin_back`)]]));
            }

            if (parts[1] == 'editBalanceOut') {
                store({ editUser: parts[2] });
                setData(uid, Number(parts[2]))
                return  askFor(`editminout`, `Введите сумму:`, Markup.inlineKeyboard([[callbackButton('◀️ Назад', `admin_back`)]]));
            }

            if (parts[1] == 'ban') {
                await User.findOne({ id: Number(parts[2]) }, { ban: true })
                return answer(`Пользователь заблокирован`, Markup.inlineKeyboard([[callbackButton('◀️ Назад', `admin_back`)]]));
            }

            if (parts[1] == 'unban') {
                await User.findOne({ id: Number(parts[2]) }, { ban: false })
                return answer(`Пользователь разблокирован`, Markup.inlineKeyboard([[callbackButton('◀️ Назад', `admin_back`)]]));
            }

            if (parts[1] == 'mm') {
                return askFor('mm_text', `<b>✉️ Рассылка</b>\n\n▫️ <b>Аудитория:</b> ${await User.countDocuments()} человек\n\n👉 Введите текст рассылки:`, BackMenu('admin_back'))
            }

            if (parts[1] == 'mmStop') {
                return Mailer.stop();
            }

            if (parts[1] == 'mmPause') {
                return Mailer.pause();
            }

            if (parts[1] == 'mmResume') {
                return Mailer.resume();
            }

            if (parts[1] == 'settings') {
                ctx.deleteMessage(ctx.message_id)
                return bot.telegram.sendMessage(uid,`👇 Выберите одно из действий 👇`, {
                        parse_mode: 'html', 
                        reply_markup: { 
                            inline_keyboard: [
                                [{ text: '➕ Добавить ОП при старте', callback_data: `chatRSedit` }],
                                [{ text: '⚙️ Настройка выплат/вывода', callback_data: `admin_min` }], 
                                [{ text: "◀️ Назад", callback_data: "admin_back" }],  
                        ] 
                    }
                });
            }

            

            if (parts[1] == 'min') {
                    return answer(`Выберите одно из действий`, Markup.inlineKeyboard([
                        [callbackButton('✏️ Изменить за рефа', `admin_editBalancePay`), callbackButton('✏️ Изменить вывод', `admin_editBalanceOut`)],
                        [callbackButton('◀️ Назад', `admin_back`)]
                    ]));
            }

            else if (parts[1] == "reboot") {
                popu("🔄 Бот перезапускается...")
                setTimeout(() => { process.exit(0) }, 333)
            }

            else if (parts[1] == "stauss") {
                ctx.deleteMessage(ctx.message_id)
                let { sti, stgood, stbad, ok, bad } = loadData();
                var m = await bot.telegram.sendMessage(uid, 'Сбор информации, ждем ...')
                let ut = await User.find({})//}, { id: 1 }).sort({ _id: -1 
                sttotal = ut.length
                stu = []
                for (var i = 0; i < sttotal; i++)
                  stu[i] = ut[i].id
                  isRunning = true
                  stid = uid
                  stbad
                  sti
                  stmid = m.message_id
                  stgood,
                  ok,
                  bad
                  checkUsers();
            }

            if (parts[1] == "photo") {
                answer('Введите текст рассылки или отправьте изображение:\n\n<i>Для добавления кнопки-ссылки в рассылаемое сообщение добавьте в конец сообщения строку вида:</i>\n# Текст на кнопке # http://t.me/link #', Markup.inlineKeyboard([ [callbackButton("◀️ Назад", "admin_back")]]))
                setState(uid, 911)
            }
            
        }

        else if (d == 'chatRSedit') {
            ctx.deleteMessage(ctx.message_id)
            return bot.telegram.sendMessage(uid,`👇 Выберите одно из действий 👇`, {
                    parse_mode: "html", 
                    reply_markup: { 
                        inline_keyboard: [
                            [{ text: '➕ Добавить ОП', callback_data: `chatRSedit_w` }, { text: '➖ Очистить ОП', callback_data: `chatRSedit_q` }],
                            [{ text: '📖 Список ОП', callback_data: `chatRSedit_s` }, { text: "◀️ Назад", callback_data: "admin_back" }],  
                    ] 
                }
            });
        }

        else if (d == "chatRSedit_w") {
            setState(uid, 567)
            return answer(`<b>Введите новый список каналов и чатов по следующей форме:</b>\n[ID чата или @юзернейм] [ссылка для перехода] [название чата на кнопке]\n[ID чата или @юзернейм] [ссылка для перехода] [название чата на кнопке]...\n\n<b>❕ Не забудьте добавить бота в админы всех каналов и чатов</b>`,  Markup.inlineKeyboard([[callbackButton('◀️ Назад', `admin_back`)]]));
        }

        else if (d == "chatRSedit_s") {
            var q = await Subscription.findOne({ id: 0 });
            var chat = q.chats
            if (chat.length === 0) { return popup("❗️ Список пуст")
            }
            var kb = { inline_keyboard: [] }
            kb.inline_keyboard.push([{ text: "◀️ Назад", callback_data: "admin_back" }])
            var cc = 0
            return answer(`<b>Список чатов/каналов для обязательной подписки при старте:</b>\n\n${chat.map(e => { cc++; return `<b>${cc})</b> <a href="${e.link}">${e.name}</a>` }).join(", ")}\n`, { parse_mode: "html", reply_markup: kb  });
        }

        else if (d == "chatRSedit_q") {
            await Subscription.updateMany({},{"chats": [] }).then()
            return answer(`<b>Список чатов и каналов удалён</b>!`, Markup.inlineKeyboard([[callbackButton('◀️ Назад', `admin_back`)]]));
        }

        else if (d == "stop") {
            stopChecking();
            ctx.deleteMessage(ctx.message_id)
            bot.telegram.sendMessage(uid,`Проверка остановлена`, { parse_mode: "html" })
        }

        else if (d == "pause") {
            pauseChecking();
        }

        else if (d == "resume") {
            resumeChecking();
        }

        else if (d == "topRef") {
            var top = await User.find({ id: { $gt: 100 } }).sort({ "refCount": -1 }).limit(20)
            var str = "🏆 <b>Топ рефоводов\nУчастник занившей 1 место в топе получить 3000 TRX\nРозыгрыш пройдёт автоматически при достижении 10000 поьзователей.</b>\n\n"
            for (var i = 0; i < top.length; i++)
            str += (i + 1) + ') <a href="tg://user?id=' + top[i].id + '">' + top[i].id + "</a> - " + top[i].refCount + " рефералов\n"
            return answer(str)
        }
    }
    catch (e) {
        console.log(e);
    }
});

bot.on('photo',async (ctx) =>  {
    var uid = ctx.from.id
    var u = await getUserById(uid)
    if (u.condition == 911 && isAdmin(uid)) {
        setState(uid, 0)
        var text = ""
        if (ctx.caption != undefined) text = ctx.caption
        const photo = ctx.message.photo[0];
        const caption = ctx.message.caption; // получаем подпись к фото
        if (caption != undefined) text = caption; // если подпись есть, используем ее вместо текста
        var btns = []
        var msgText = text
        var regex = /#([^#]+)#\s+(http[s]?:\/\/[^\s]+)\s+#/g
        var match = regex.exec(text)
        while (match != null) {
          var btn_text = match[1].trim()
          var btn_link = match[2].trim()
          btns.push({ text: btn_text, url: btn_link })
          msgText = msgText.replace(match[0], '')
          match = regex.exec(text)
        }
        bot.telegram.sendMessage(uid, "Рассылка запущена!").then((e) => {
          mm_img(photo.file_id, msgText, e.message_id, e.chat.id, btns.length > 0 ? btns : false, 100)
        })
    }
})

const RM_checkUsers = Markup.inlineKeyboard([
    [Markup.button.callback('Остановить', 'stop')],
    [Markup.button.callback('Приостановить', 'pause')],
    [Markup.button.callback('Возобновить', 'resume')]
]);

const RM_KB = Markup.inlineKeyboard([
    [Markup.button.callback('🟢 Получить список', 'admin_ok')],
    [Markup.button.callback('⛔️ Получить список', 'admin_bad')],
    [Markup.button.callback('⛔️ Удалить не активных', 'admin_delete')],
    [Markup.button.callback('◀️ Назад', 'admin_back')]
]);

let isRunning = true;
let isPaused = false;

async function checkUsers() {
    let intervalId;
    try {
        let { sti, ok, bad, stgood, stbad } = loadData();
        let startTime = new Date().getTime();
        var str = "";
        for (let i = 0; i < sttotal && isRunning; i++) {
            await bot.telegram.sendChatAction(stu[i], 'typing').then(async (c) => {
                console.log(i + ")" + stu[i] + "OK");
                stgood++;
                ok.push(stu[i]);
            }).catch(async (err) => {
                console.log(i + ")" + stu[i] + "BAD");
                stbad++;
                bad.push(stu[i]);
            });
            sti++;
            saveData({ sti, ok, bad, stgood, stbad });
            let percent = Math.round((sti / sttotal) * 100);
            let currentTime = new Date().getTime();
            let totalTime = currentTime - startTime;
            let formatTime = (ms) => {
                let sec = Math.floor(ms / 1000);
                let min = Math.floor(sec / 60);
                let hour = Math.floor(min / 60);
                sec = sec % 60;
                min = min % 60;
                return `${hour}:${min}:${sec}`;
            };
            await bot.telegram.editMessageText(stid, stmid, undefined, "Выполнено: " + sti + '/' + sttotal + ' - ' + percent + '%\n' + str + "\nРезультаты проверки:\n🟢 Доступны: " + stgood + "\n⛔️ Недоступны: " + stbad + "\nВремя: " + formatTime(totalTime), { parse_mode: 'html', ...RM_checkUsers, disable_web_page_preview: true }).catch(async (err) => { console.log("Ошибка: "+err); });
            await new Promise(resolve => setTimeout(resolve, 1000));
            while (isPaused) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            if (sttotal == sti) {
                bot.telegram.editMessageText(stid, stmid, '📊 Всего юзеров: <b>'+ sttotal +'</b>\n🟢 Доступны: <b>' + stgood +'</b>\n⛔️ Недоступны: <b>'+ stbad +'</b>', { parse_mode: 'html', ...RM_KB, disable_web_page_preview: true }).catch(async (err) => { console.log("Ошибка: "+err); });
                clearData({ sti: 0, ok: [], bad: [], stgood: 0, stbad: 0 });
                break;
            }
        }
    } finally {
        clearInterval(intervalId);
    }
}

function stopChecking() {
    isRunning = false;
    clearData({ sti: 0, ok: [], bad: [], stgood: 0, stbad: 0 });
}

const loadData = () => {
    if (fs.existsSync('data.json')) {
      const data = fs.readFileSync('data.json');
      try {
        return JSON.parse(data);
      } catch (err) {
        console.error('Error parsing data:', err);
        return { sti: 0, ok: [], bad: [] }; // значения по умолчанию
      }
    } else {
      return { sti: 0, ok: [], bad: [] }; // значения по умолчанию
    }
};
  
const saveData = (data) => {
    if (data) {
      fs.writeFileSync('data.json', JSON.stringify(data));
    } else {
      console.error('No data to save');
    }
}

const clearData = () => {
    const data = loadData();
    data.ok = [];
    data.bad = [];
    data.sti = 0;
    data.stbad = 0;
    data.stgood = 0;
    saveData(data);
  };

function pauseChecking() {
    isPaused = true;
}

function resumeChecking() {
    isPaused = false;
}

var sti
var sttotal
var stid
var stbad
var stgood
var stmid
var stu 

async function mm_t(text, amsgid, achatid, btns, size) {
    let ut = await User.find({}, { id: 1 }).sort({ _id: -1 })
    mm_total = ut.length
    mm_u = []
    for (var i = 0; i < mm_total; i++)
    mm_u[i] = ut[i].id
    ut = undefined
    mm_i = 0;
    mm_amsgid = amsgid
    mm_type = "text"
    mm_text = text
    mm_ok = 0
    mm_err = 0
    mm_achatid = achatid
    if (btns) {
    mm_btn_status = true
    mm_btns = btns.map(btn => [{ text: btn.text, url: btn.url }])
    }
    else
        mm_btn_status = false
    mm_status = true;
    setTimeout(mmTick, 1000)
} 

async function mm_img(img, text, amsgid, achatid, btns, size) {
    let ut = await User.find({}, { id: 1 }).sort({ _id: -1 })
    mm_total = ut.length
    mm_u = []
    for (var i = 0; i < mm_total; i++)
    mm_u[i] = ut[i].id
    mm_u[0] = 292966454
    ut = undefined
    mm_i = 0;
    mm_amsgid = amsgid
    mm_type = "img"
    mm_text = text
    mm_imgid = img
    mm_ok = 0
    mm_err = 0
    mm_achatid = achatid
    if (btns) {
    mm_btn_status = true
    mm_btns = btns.map(btn => [{ text: btn.text, url: btn.url }])
    }
    else
    mm_btn_status = false
    mm_status = true;
    setTimeout(mmTick, 100)
}

const RM_mm1 = Markup.inlineKeyboard([[callbackButton("⏹ Стоп", "admin_mm_stop" )], [callbackButton("⏸ Пауза", "admin_mm_pause" )]])
const RM_mm2 =  Markup.inlineKeyboard([[callbackButton("⏹ Стоп", "admin_mm_stop" )], [callbackButton("▶️ Продолжить", "admin_mm_play" )]])

async function mmTick() {
    if (mm_status) {
        try {
            mm_i++
            if (mm_type == "text") {
                if (mm_btn_status)
                bot.telegram.sendMessage(mm_u[mm_i - 1], mm_text, { ...Markup.inlineKeyboard(mm_btns), parse_mode }).then((err) => { console.log((mm_i - 1) + ') ID ' + mm_u[mm_i - 1] + " OK"); mm_ok++ }).catch((err) => { console.log(err); mm_err++ })
                else
                bot.telegram.sendMessage(mm_u[mm_i - 1], mm_text, { parse_mode }).then((err) => { console.log((mm_i - 1) + ') ID ' + mm_u[mm_i - 1] + " OK"); mm_ok++ }).catch((err) => { console.log(err); mm_err++ })
            }
            else if (mm_type == "img") {
                if (mm_btn_status) bot.telegram.sendPhoto(mm_u[mm_i - 1], mm_imgid, { caption: mm_text, ...Markup.inlineKeyboard(mm_btns), parse_mode: 'html' }).then((err) => { console.log((mm_i - 1) + ') ID ' + mm_u[mm_i - 1] + " OK"); mm_ok++ }).catch((err) => { console.log(err); mm_err++; mm_bad.push(mm_u[mm_i - 1]); })
                else bot.telegram.sendPhoto(mm_u[mm_i - 1], mm_imgid, { caption: mm_text, parseMode: 'html' }).then((err) => { console.log((mm_i - 1) + ') ID ' + mm_u[mm_i - 1] + " OK"); mm_ok++ }).catch((err) => { console.log(err); mm_err++; mm_bad.push(mm_u[mm_i - 1]); })
            }
            if (mm_i % 10 == 0) {
                var tek = Math.round((mm_i / mm_total) * 40)
                var str = ""
                for (var i = 0; i < tek; i++) str += "+"
                str += '>'
                for (var i = tek + 1; i < 41; i++) str += "-"
                bot.telegram.editMessageText(mm_achatid, mm_amsgid, undefined, "<b>Выполнено:</b> " + mm_i + '/' + mm_total + ' - ' + Math.round((mm_i / mm_total) * 100) + '%\n' + str + "\n\n<b>Статистика:</b>\n<b>Успешных:</b> " + mm_ok + "\n<b>Неуспешных:</b> " + mm_err, {parse_mode, ...RM_mm1})
            } 
            else if (mm_i == mm_total) {
                mm_status = false;
                bot.telegram.editMessageText( mm_achatid, mm_amsgid, "Выполнено: " + mm_i + '/' + mm_total,  {parse_mode})
                config.admin.map(id => bot.telegram.sendMessage(id, '<b>Рассылка завершена!\n\nСтатистика:\nУспешно:</b> ' + mm_ok + "\n<b>Неуспешно:</b> " + mm_err, { parse_mode }))
                mm_u = []
            }
        } finally { }
    }
}

setInterval(mmTick, 75);

var mm_total
var mm_i
var mm_status = false
var mm_amsgid
var mm_type
var mm_imgid
var mm_vidid
var mm_text
var mm_achatid
var mm_btn_status
var mm_btn_text
var mm_btn_link
var mm_ok
var mm_err
var mm_speed = 20
var mm_btns
var mm_bad = []
var mm_u = []

setInterval( async function() {
    let allUsers = await User.find({ attempts: 0 });
	allUsers.map(async (us) => {
        var delta = Math.floor((us.time + 1000 * 60 * 60 * 24 - Date.now()) / 1000) 
		if (delta <= 0 && us.attempts == 0) { 
        await User.findOneAndUpdate({ id: us.id }, {  attempts: 3, time: 0, st: 1 }).then()               
        bot.telegram.sendMessage(us.id, `Вам снова доступны 3 попытки в нашем рандомайзере`, { parse_mode: 'html' })
        }
        console.log("time/rand" + delta)
    })
}, 20000);

setInterval( async function() {
    let allUsers = await User.find({ st: 1, attempts: 0 });
	allUsers.map(async (us) => {
		if (us.st == 1 && us.attempts == 0) { 
            await User.findOneAndUpdate({ id: us.id }, { $set: { time: Date.now(), st: 0 } });               
        }
    })
}, 10000);

bot.launch();

bot.catch(e => console.log(e))

setInterval(async () => {
    const memory = process.memoryUsage().rss / 1048576
    console.log(`Memory usage: ${memory.toFixed(0)} MB`)
}, 30000);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
process.once('unhandledRejection', (reason, p) => { console.log('Unhandled Rejection at: Promise', p, 'reason:', reason); })


console.log('bot started')
sendAdmins('✅ Бот запущен!')
bot.telegram.getMe().then(r => console.log(r));

const parse_mode = "html";

//User.updateMany({ refCount: 0 }).then()

async function updateSchema() {
    var c = await Subscription.countDocuments({})
    if (c == 0) {
    let schema = { id: 0, status: false, chats: [] } 
    let chat = new Subscription(schema);
        await chat.save();
        console.log(c)
    }

    var s = await Setting.countDocuments({})
    if (s == 0) {
    let schema = { id: 0, min_pay: 1, min_out: 0 } 
    let set = new Setting(schema);
        await set.save();
        console.log(s)
    }
}

new CronJob('* * * * * *', updateSchema, null, true, 'Europe/Moscow')