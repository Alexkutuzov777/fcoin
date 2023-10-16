import mongoose from 'mongoose';

const User = mongoose.model("users", new mongoose.Schema({
    id: Number,
    lastBonus: Number,
    balance: Number,
    waitFor: String,
    ref: Number,
    ban: Boolean, 
    dat: String,
    earned: Number,
    condition: Number,
    state: Number,
    attempts: Number, 
    time: Number,
    st: Number,
    refCount: Number
}));

const Mailing = mongoose.model("mailings", new mongoose.Schema({
    uid: Number,
    text: String,
    mm: Boolean,
    entities: Array
}))

const Subscription = mongoose.model('subscriptions', new mongoose.Schema({
    id: Number, 
    status: Boolean, 
    chats: Array,
}));

const Setting = mongoose.model('settings', new mongoose.Schema({
    id: Number, 
    min_pay: Number, 
    min_out: Number,
}));

export { User, Mailing, Subscription, Setting };