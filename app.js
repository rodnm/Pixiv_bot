import config from './config.js'
import handlers from './handlers/index.js'
import db from './db.js'
import { update_setting } from './db.js'
const { asyncForEach, handle_illust, handle_ranking, handle_novel, get_pixiv_ids, get_user_illusts, ugoira_to_mp4, download_file, _l, k_os, k_link_setting, mg_create, mg_albumize, mg_filter, mg2telegraph, flagger, honsole, handle_new_configuration, exec, sleep, reescape_strings, get_ugoira_path } = handlers
import { tgBot as bot } from './bot.js'
import axios from 'axios'

bot.use(async (ctx, next) => {
    // simple i18n
    ctx.l = (!ctx.from || !ctx.from.language_code) ? 'en' : ctx.from.language_code
    ctx.text = ''
    ctx.default_extra = {
        parse_mode: 'MarkdownV2'
    }
    try {
        if (ctx.message) {
            if (ctx.message.text) {
                // remove command[@username] : /start@Pixiv_bot -> /start
                ctx.text = ctx.message.text
                ctx.stext = ctx.message.text.split(' ')
                if (ctx.message.entities && ctx.message.entities.length > 0) {
                    ctx.command = ctx.message.text.substr(1, ctx.message.entities[0].length - 1)
                }
                if (ctx.stext[0].includes('@')) {
                    let at = ctx.stext[0].split('@')
                    if (!at[1] || at[1].toLowerCase() !== bot.botInfo.username.toLowerCase()) {
                        ctx.command = ''
                    } // else {
                    //     ctx.message.text = ctx.message.text.replace(new RegExp(bot.botInfo.username, 'i'), '')
                    //     ctx.message.entities[0].length = ctx.command.length + 1
                    // }
                }
            }
            ctx.default_extra.reply_to_message_id = ctx.message.message_id
            ctx.default_extra.allow_sending_without_reply = true
            if (ctx.update.channel_post) {
                ctx.chat_id = ctx.channelPost.chat.id
                // channel post is anonymous
                ctx.user_id = 1087968824
            }
            else {
                ctx.chat_id = ctx.message.chat.id
                ctx.user_id = ctx.from.id
            }
        }
        else if (ctx.inlineQuery && ctx.inlineQuery.query) {
            ctx.text = ctx.inlineQuery.query
            ctx.chat_id = ctx.inlineQuery.from.id
            ctx.user_id = ctx.inlineQuery.from.id
        }
        else if (ctx.callbackQuery && ctx.callbackQuery.data) {
            ctx.chat_id = ctx.callbackQuery.message.chat.id
            ctx.user_id = ctx.callbackQuery.from.id
        }
    }
    catch (error) {
        honsole.warn('handle_basic_msg', error)
    }
    next()
})

bot.start(async (ctx, next) => {
    // startPayload = deeplink 
    // see more https://core.telegram.org/bots#deep-linking
    if (!ctx.startPayload.trim() || ctx.startPayload === 's') {
        // reply start help command
        await bot.telegram.sendMessage(ctx.chat.id, _l(ctx.l, 'start'), {
            ...ctx.default_extra
        })
    }
    else {
        // callback to bot.on function
        next()
    }
})

bot.help(async (ctx) => {
    await bot.telegram.sendMessage(ctx.chat.id, 'https://pixiv-bot.pages.dev', {
        ...ctx.default_extra,
        parse_mode: ''
    })
})

bot.command('/id', async (ctx) => {
    let text = ctx.chat.id < 0 ? `#chatid: \`${ctx.chat.id}\`\n` : ''
    // channel post maybe didn't have .from
    text += ctx.from ? `#userid: \`${ctx.from.id}\`` : ''
    await bot.telegram.sendMessage(ctx.chat.id, text, {
        ...ctx.default_extra,
        parse_mode: 'Markdown'
    })
})

bot.use(async (ctx, next) => {
    let configuration_mode = false
    if ((ctx.command === 's' || ctx.text.substr(0, 3) === 'eyJ') ||
        (ctx.message && ctx.message.reply_to_message && ctx.message.reply_to_message.from.id === bot.botInfo.id && ctx.message.reply_to_message.text.substr(0, 5) === '#link')) {
        configuration_mode = true
    }
    ctx.ids = get_pixiv_ids(ctx.text)
    if (!ctx.callbackQuery && !ctx.inlineQuery && JSON.stringify(ctx.ids).length === 36 & !configuration_mode && !['link'].includes(ctx.command) && !ctx.text.includes('fanbox.cc')) {
        // bot have nothing to do
        return
    }
    // read configuration
    ctx.flag = await flagger(bot, ctx)
    honsole.dev('input ->', ctx.chat, ctx.text, ctx.flag)
    if (ctx.flag === 'error') {
        honsole.warn('flag error', ctx.text)
        return
    }
    else {
        next()
    }
})

bot.on('callback_query', async (ctx) => {
    let chat_id = ctx.chat_id
    let message_id = ctx.callbackQuery.message.message_id
    let user_id = ctx.user_id
    let stext = ctx.callbackQuery.data.split('|')
    let linked_chat_id = parseInt(stext[2])
    let apply_flag = false
    // let action = stext[0].replace('_','∏').split('∏')
    if (stext[0] === 'l') {
        if ((chat_id > 0 || await is_chat_admin(chat_id, user_id)) && await is_chat_admin(linked_chat_id, user_id)) {
            if (stext[1] === 'link_unlink') {
                await update_setting({
                    del_link_chat: {
                        chat_id: linked_chat_id
                    }
                }, chat_id)
                await bot.telegram.editMessageText(chat_id, message_id, false, _l(ctx.l, 'link_unlink_done'), {
                    reply_markup: {}
                })
                apply_flag = true
            }
            else {
                try {
                    let link_setting = {
                        chat_id: stext[2],
                        ...ctx.flag.setting.link_chat_list[stext[2]]
                    }
                    link_setting[stext[1].replace('link_', '')] = stext[4]
                    await update_setting({
                        add_link_chat: link_setting
                    }, chat_id)
                    await bot.telegram.editMessageReplyMarkup(chat_id, message_id, false, k_link_setting(ctx.l, link_setting).reply_markup)
                    apply_flag = true
                }
                catch (error) {
                    console.warn(error)
                }
            }
        }
        else {
            await ctx.answerCbQuery(reescape_strings(_l(ctx.l, 'error_not_a_gc_administrator')), {
                show_alert: true
            })
            return
        }
    }
    if (apply_flag) {
        ctx.answerCbQuery(reescape_strings(_l(ctx.l, 'saved')))
    }
    else {
        ctx.answerCbQuery(reescape_strings(_l(ctx.l, 'error')))
    }
})

bot.command('/link', async (ctx) => {
    // link this chat to another chat / channel
    let chat_id = ctx.message.chat.id
    let user_id = ctx.from.id
    if (ctx.from.id === 1087968824) {
        await bot.telegram.sendMessage(chat_id, _l(ctx.l, 'error_anonymous'), ctx.default_extra)
    }
    else {
        if (chat_id > 0 || await is_chat_admin(chat_id, user_id)) {
            // if (ctx.flag.setting.link_chat_list && JSON.stringify(ctx.flag.setting.link_chat_list).length > 2) {
            let new_flag = true
            if (ctx.flag.setting.link_chat_list) {
                for (const linked_chat_id in ctx.flag.setting.link_chat_list) {
                    // support muilt linked chat
                    // It's hard think permission
                    // So only link 1
                    if (await is_chat_admin(linked_chat_id, user_id)) {
                        await bot.telegram.sendMessage(chat_id, _l(ctx.l, 'link_setting'), {
                            ...ctx.default_extra,
                            ...k_link_setting(ctx.l, {
                                chat_id: linked_chat_id,
                                ...ctx.flag.setting.link_chat_list[linked_chat_id]
                            })
                        })
                    }
                    else {
                        await bot.telegram.sendMessage(chat_id, _l(ctx.l, 'error_not_a_gc_administrator'), ctx.default_extra)
                    }
                    new_flag = false
                }
            }
            if (new_flag) {
                await bot.telegram.sendMessage(chat_id, '\\#link ' + _l(ctx.l, 'link_start'), {
                    ...ctx.default_extra,
                    reply_markup: {
                        force_reply: true,
                        selective: true
                    }
                })
            }
        }
        else {
            await bot.telegram.sendMessage(chat_id, _l(ctx.l, 'error_not_a_gc_administrator'), ctx.default_extra)
        }
    }
})

bot.on('text', async (ctx) => {
    let chat_id = ctx.chat_id
    let user_id = ctx.user_id
    if (ctx.command === 's' || ctx.text.substr(0, 3) === 'eyJ') {
        await handle_new_configuration(bot, ctx, ctx.default_extra)
        return
    }
    // @link
    if (ctx.message && ctx.message.reply_to_message && ctx.message.reply_to_message.text && ctx.message.reply_to_message.text.substr(0, 5) === '#link') {
        if (ctx.from.id === 1087968824) {
            await bot.telegram.sendMessage(ctx.chat.id, _l(ctx.l, 'error_anonymous'), ctx.default_extra)
        }
        if ((ctx.chat.id > 0 || await is_chat_admin(ctx.chat.id, ctx.from.id)) && await is_chat_admin(ctx.text, ctx.from.id)) {
            let linked_chat = await bot.telegram.getChat(ctx.text)
            let default_linked_setting = {
                chat_id: linked_chat.id,
                type: linked_chat.type,
                sync: 0,
                administrator_only: 0,
                repeat: 0
            }
            // if(
            await update_setting({
                add_link_chat: default_linked_setting
            }, ctx.chat.id)
            await bot.telegram.sendMessage(ctx.chat.id, _l(ctx.l, 'link_done', linked_chat.title, linked_chat.id) + _l(ctx.l, 'link_setting'), {
                ...ctx.default_extra,
                ...k_link_setting(ctx.l, default_linked_setting)
            })
        }
        else {
            await bot.telegram.sendMessage(ctx.chat.id, _l(ctx.l, 'error_not_a_gc_administrator'), ctx.default_extra)
        }
        return
    }

    let direct_flag = true
    for (const linked_chat_id in ctx.flag.setting.link_chat_list) {
        let link_setting = ctx.flag.setting.link_chat_list[linked_chat_id]
        if (ctx.message.sender_chat && ctx.message.sender_chat.id === linked_chat_id) {
            direct_flag = false
            // sync mode
        }
        else if ((ctx.type !== 'channel') && (chat_id > 0 || link_setting.sync === 0 || (link_setting.sync === 1 && ctx.message.text.includes('@' + bot.botInfo.username)))) {
            // admin only
            if (chat_id > 0 || link_setting.administrator_only === 0 || (link_setting.administrator_only === 1 && await is_chat_admin(chat_id, user_id))) {
                let new_ctx = {
                    ...ctx,
                    chat_id: linked_chat_id,
                    user_id: user_id,
                    default_extra: {
                        parse_mode: 'MarkdownV2'
                    },
                    type: link_setting.type
                }
                delete new_ctx.flag
                await tg_sender(new_ctx)
                if (link_setting.repeat < 2) {
                    direct_flag = false
                    if (link_setting.repeat === 1) {
                        // feature request:
                        // return message id
                        await ctx.reply(_l(ctx.l, 'sent'), {
                            ...ctx.default_extra,
                            reply_to_message_id: ctx.message.message_id
                        })
                    }
                }
            }
        }
    }
    if (direct_flag) {
        await tg_sender(ctx)
    }
    return
})

let chating_list = []
/**
 * build ctx object can send illust / novel manually (subscribe / auto push)
 * @param {*} ctx
 */
async function tg_sender(ctx) {
    let chat_id = ctx.chat_id || ctx.message.chat.id
    if (chating_list.includes(chat_id)) {
       await sleep(3000)
       return tg_sender(ctx)
    } else {
       chating_list.push(chat_id)
    }
    let user_id = ctx.user_id || ctx.from.id
    let text = ctx.text || ''
    let default_extra = ctx.default_extra
    let temp_data = {
        mg: []
    }
    if (!ctx.flag) {
        ctx.flag = await flagger(bot, ctx)
    }
    let ids = ctx.ids
    let illusts = []
    if (ids.author.length > 0) {
        // alpha version (owner only)
        if (user_id === config.tg.master_id) {
            bot.telegram.sendChatAction(chat_id, 'typing')
            await asyncForEach(ids.author, async (id) => {
                illusts = [...illusts, ...await get_user_illusts(id)]
            })
        }
    }
    if (ids.illust.length > 0) {
        await asyncForEach(ids.illust, async (id) => {
            let d = await handle_illust(id, ctx.flag)
            if (d) {
                // if (d.type <= 1) bot.telegram.sendChatAction(chat_id, 'upload_photo')
                // if (d.type == 2) bot.telegram.sendChatAction(chat_id, 'upload_video')
                illusts.push(d)
            }
        })
    }
    if (ctx.flag.desc) {
        illusts = illusts.reverse()
    }
    if (illusts.length > 0) {
        await asyncForEach(illusts, async (illust) => {
            let d = illust
            if (d === 404) {
                if (chat_id > 0) {
                    await bot.telegram.sendMessage(chat_id, _l(ctx.l, 'illust_404'), default_extra)
                    return
                }
            }
            ctx.flag.q_id += 1
            let mg = mg_create(d, ctx.flag)
            // send as file
            if (ctx.flag.asfile) {
                await asyncForEach(mg, async (o) => {
                    bot.telegram.sendChatAction(chat_id, 'upload_document')
                    let extra = {
                        ...default_extra,
                        caption: o.caption.replaceAll('%mid%', '')
                    }
                    if (mg.type === 'video') {
                        await ugoira_to_mp4(mg.id)
                    }
                    await bot.telegram.sendDocument(chat_id, o.media_o, extra).catch(async (e) => {
                        if (await catchily(e, chat_id, ctx.l)) {
                            if (d.type <= 2) {
                                await bot.telegram.sendDocument(chat_id, { source: await download_file(o.media_o, o.id) }, { ...extra, thumb: { source: await download_file(o.media_r ? o.media_r : o.media_o, o.id) } }).catch(async (e) => {
                                    if (await catchily(e, chat_id, ctx.l)) {
                                        await bot.telegram.sendMessage(chat_id, _l(ctx.l, 'file_too_large', o.media_o.replace('i-cf.pximg.net', config.pixiv.pximgproxy)), default_extra)
                                    }
                                })
                            }
                            else {
                                await bot.telegram.sendMessage(chat_id, _l(ctx.l, 'error'), default_extra)
                            }
                        }
                    })
                })
            }
            else {
                if (ctx.flag.telegraph || (ctx.flag.album && (ids.illust.length > 1 || (d.imgs_ && d.imgs_.size.length > 1)))) {
                    temp_data.mg = [...temp_data.mg, ...mg]
                }
                else {
                    if (d.type === 2 && ctx.startPayload) {
                        // see https://core.telegram.org/bots/api#inlinekeyboardbutton
                        // Especially useful when combined with switch_pm… actions – in this case the user will be automatically returned to the chat they switched from, skipping the chat selection screen.
                        // So we need inline share button to switch chat window even if user don't want share button
                        ctx.flag.share = true
                    }
                    let extra = {
                        ...default_extra,
                        caption: mg[0].caption.replaceAll('%mid%', ''),
                        ...k_os(d.id, ctx.flag)
                    }
                    if (d.type <= 1) {
                        if (mg.length === 1) {
                            let photo_urls = [mg[0].media_o, `dl-${mg[0].media_o}`, mg[0].media_r, `dl-${mg[0].media_r}`]
                            // Telegram will download and send the file. 5 MB max size for photos
                            // It's useless to provide original (Telegram will compress image about 200kb)
                            if (mg[0].fsize > 5000000) {
                                photo_urls = [mg[0].media_r, `dl-${mg[0].media_r}`]
                            }
                            await sendPhotoWithRetry(chat_id, ctx.l, photo_urls, extra)
                        } else {
                            temp_data.mg = [...temp_data.mg, ...mg_albumize(mg)]
                        }
                    } else if (d.type === 2) {
                        bot.telegram.sendChatAction(chat_id, 'upload_video')
                        let media = mg.media_t
                        if (!media) {
                            await ugoira_to_mp4(d.id)
                            media = {
                                source: get_ugoira_path(d.id)
                            }
                        }
                        await bot.telegram.sendAnimation(chat_id, media, extra).then(async (data) => {
                            // save ugoira file_id and next time bot can reply without send file
                            if (!d.tg_file_id && data.document) {
                                let col = db.collection.illust
                                await col.updateOne({
                                    id: d.id
                                }, {
                                    $set: {
                                        tg_file_id: data.document.file_id
                                    }
                                })
                            }
                        }).catch(async (e) => {
                            if (await catchily(e, chat_id, ctx.l)) {
                                bot.telegram.sendMessage(chat_id, _l(ctx.l, 'error'), default_extra)
                            }
                        })
                    }
                }
            }
        })
        // eslint-disable-next-line no-empty
        if (ctx.flag.asfile) {
        } else if (ctx.flag.telegraph) {
            try {
                bot.telegram.sendChatAction(chat_id, 'typing')
                let res_data = await mg2telegraph(temp_data.mg, ctx.flag.telegraph_title, user_id, ctx.flag.telegraph_author_name, ctx.flag.telegraph_author_url)
                if (res_data) {
                    await asyncForEach(res_data, async (d) => {
                        await bot.telegram.sendMessage(chat_id, d.ids.join('\n') + '\n' + d.telegraph_url)
                    })
                    await bot.telegram.sendMessage(chat_id, _l(ctx.l, 'telegraph_iv'), default_extra)
                }
            }
            catch (error) {
                console.warn(error)
            }
        } else {
            if (ctx.flag.album) {
                temp_data.mg = mg_albumize(temp_data.mg, ctx.flag.single_caption)
            }
            if (temp_data.mg.length > 0) {
                let extra = default_extra
                await asyncForEach(temp_data.mg, async (mg, i) => {
                    let data = await sendMediaGroupWithRetry(chat_id, ctx.l, mg, extra, ['o', 'r', 'dlo', 'dlr'])
                    if (data) {
                        if (data[0] && data[0].message_id) {
                            extra.reply_to_message_id = data[0].message_id
                        }
                        else {
                            delete extra.reply_to_message_id
                        }
                    } else {
                        honsole.warn('error send mg', data)
                        // await bot.telegram.sendMessage(chat_id, _l(ctx.l, 'error'), default_extra)
                    }
                    // Too Many Requests: retry after 10
                    if (i > 4) {
                        await sleep(3000)
                    }
                    else {
                        await sleep(1000)
                    }
                })
            }
        }
    }
    if (ids.novel.length > 0) {
        await asyncForEach(ids.novel, async (id) => {
            bot.telegram.sendChatAction(chat_id, 'typing')
            let d = await handle_novel(id)
            if (d) {
                await bot.telegram.sendMessage(chat_id, `${d.telegraph_url}`)
            }
            else {
                await bot.telegram.sendMessage(chat_id, _l(ctx.l, 'illust_404'), default_extra)
            }
        })
    }
    if (text.includes('fanbox.cc/') && chat_id > 0) {
        await bot.telegram.sendMessage(chat_id, _l(ctx.l, 'fanbox_not_support'), default_extra)
    }
    chating_list.splice(chating_list.indexOf(chat_id), 1)
    return true
}

bot.on('inline_query', async (ctx) => {
    let res = []
    let offset = ctx.inlineQuery.offset
    if (!offset) {
        offset = 0; // offset == empty -> offset = 0
    }
    let query = ctx.text
    // offset = page
    offset = parseInt(offset)
    let res_options = {
        cache_time: 20,
        is_personal: ctx.flag.setting.dbless ? false : true // personal result
    }
    let ids = ctx.ids
    if (ids.illust.length > 0) {
        await asyncForEach([...ids.illust.reverse()], async (id) => {
            let d = await handle_illust(id, ctx.flag)
            if (!d || d === 404) {
                return
            }
            // There is no enough time to convert ugoira, so need switch_pm to bot's chat window convert
            if (d.type === 2 && d.inline.length === 0) {
                // pre convert (without await)
                ugoira_to_mp4(d.id)
                await ctx.answerInlineQuery([], {
                    switch_pm_text: _l(ctx.l, 'pm_to_generate_ugoira'),
                    switch_pm_parameter: ids.illust.join('-_-').toString(),
                    cache_time: 0
                }).catch(async (e) => {
                    await catchily(e, chat_id, ctx.l)
                })
                return true
            }
            res = d.inline.concat(res)
        })
        if (res.splice((offset + 1) * 20 - 1, 20)) {
            res_options.next_offset = offset + 1
        }
        res = res.splice(offset * 20, 20)
    }
    else if (query.replaceAll(' ', '') === '') { // why not use .trim() ? LOL
        let data = await handle_ranking([offset], ctx.flag)
        res = data.data
        if (data.next_offset) {
            res_options.next_offset = data.next_offset
        }
    }
    await ctx.answerInlineQuery(res, res_options).catch(async (e) => {
        await catchily(e, config.tg.master_id, ctx.l)
    })
})

bot.catch(async (e) => {
    honsole.warn('gg', e)
    bot.telegram.sendMessage(config.tg.master_id, e, {
        disable_web_page_preview: true
    })
})

db.db_initial().then(async () => {
    if (!process.env.DEPENDIONLESS && !process.env.dev) {
        try {
            await exec('which ffmpeg')
            await exec('which mp4fpsmod')
        }
        catch (error) {
            console.error('You must install ffmpeg and mp4fpsmod to enable ugoira to mp4 function', error)
            console.error('If you want to run but won\'t install ffmpeg and mp4fpsmod, please exec following command:')
            console.error('DEPENDIONLESS=1 node app.js')
            console.log('bye')
            process.exit()
        }
    }
    await bot.launch().then(async () => {
        console.log(new Date(), 'bot started!')
        bot.telegram.sendMessage(config.tg.master_id, `${new Date().toString()} bot started!`)
    }).catch((e) => {
        console.error('You are offline or bad bot token', e)
        process.exit()
    })
    if (config.web.enabled && !process.env.WEBLESS) {
        import('./web.js')
    }
})

/**
 * catch error report && reply
 * @param {*} e error
 * @param {*} ctx ctx
 */
async function catchily(e, chat_id, language_code = 'en') {
    let default_extra = {
        parse_mode: 'MarkdownV2'
    }
    honsole.warn(e)
    try {
        bot.telegram.sendMessage(config.tg.master_id, e, {
            disable_web_page_preview: true
        })
        if (e.response) {
            let description = e.response.description
            if (description.includes('MEDIA_CAPTION_TOO_LONG')) {
                bot.telegram.sendMessage(chat_id, _l(language_code, 'error_text_too_long'), default_extra)
                return false
            } else if (description.includes('can\'t parse entities: Character')) {
                bot.telegram.sendMessage(chat_id, _l(language_code, 'error_format', e.response.description))
                return false
                // banned by user
            } else if (description.includes('Forbidden:')) {
                return false
                // not have permission
            } else if (description.includes('not enough rights to send')) {
                bot.telegram.sendMessage(chat_id, _l(language_code, 'error_not_enough_rights'), default_extra)
                return false
                // just a moment
            } else if (description.includes('Too Many Requests')) {
                console.log(chat_id, 'sleep', e.response.parameters.retry_after, 's')
                await sleep(e.response.parameters.retry_after * 1000)
                return 'redo'
            } else if (description.includes('failed to get HTTP URL content') || description.includes('wrong file identifier/HTTP URL specified') || description.includes('wrong type of the web page content') || description.includes('group send failed')) {
                let photo_urls = []
                if (e.on) {
                    if (e.on.method === 'sendPhoto') {
                        photo_urls[0] = e.on.payload.photo
                    } else if (e.on.method === 'sendMediaGroup' && e.on.payload.media) {
                        photo_urls = e.on.payload.media.filter(m => {
                            return m.media && typeof m.media === 'string' && m.media.includes('https://')
                        }).map(m => {
                            return m.media
                        })
                    }
                }
                // honsole.dev(photo_urls)
                if (config.tg.refetch_api && photo_urls) {
                    try {
                        await axios.post(config.tg.refetch_api, {
                            url: photo_urls.join('\n')
                        })
                        honsole.log('[ok] fetch new url(s)', photo_urls)
                    } catch (error) {
                        honsole.warn('[err] fetch new url(s)', error)
                    }
                }
            }
        }
    }
    catch (error) {
        console.warn(error)
        return false
    }
    return true
}

/**
 * send mediagroup with retry
 * @param {*} chat_id
 * @param {*} mg
 * @param {*} extra
 * @param {*} mg_type
 * @returns
 */
async function sendMediaGroupWithRetry(chat_id, language_code, mg, extra, mg_type = []) {
    if (mg_type.length === 0) {
        honsole.warn('empty mg', chat_id, mg)
        return false
    }
    let current_mg_type = mg_type.shift()
    bot.telegram.sendChatAction(chat_id, 'upload_photo').catch()
    try {
        return await bot.telegram.sendMediaGroup(chat_id, await mg_filter([...mg], current_mg_type), extra)
    } catch (e) {
        let status = await catchily(e, chat_id, language_code)
        if (status) {
            if (status === 'redo') {
                mg_type.unshift(current_mg_type)
            }
            return await sendMediaGroupWithRetry(chat_id, language_code, mg, extra, mg_type)
        } else {
            honsole.warn('error send mg', chat_id, mg)
            return false
        }
    }
}

/**
 * send photo with retry
 * @param {*} chat_id
 * @param {*} mg
 * @param {*} extra
 * @param {*} mg_type
 * @returns
 */
async function sendPhotoWithRetry(chat_id, language_code, photo_urls = [], extra) {
    if (photo_urls.length === 0) {
        honsole.warn('error send photo', chat_id, photo_urls)
        return false
    }
    bot.telegram.sendChatAction(chat_id, 'upload_photo').catch()
    try {
        let photo_url = photo_urls.shift()
        if (photo_url.substr(0, 3) === 'dl-') {
            photo_url = {
                source: await download_file(photo_url.substr(3))
            }
        }
        return await bot.telegram.sendPhoto(chat_id, photo_url, extra)
    } catch (e) {
        let status = await catchily(e, chat_id, language_code)
        if (status) {
            if (status === 'redo') {
                photo_urls.unshift(photo_url)
            }
            return await sendPhotoWithRetry(chat_id, language_code, photo_urls, extra)
        } else {
            honsole.warn('error send photo', chat_id, photo_urls)
            return false
        }
    }
}

/**
 * when user is chat's administrator / creator, return true
 * @param {*} chat_id
 * @param {*} user_id
 * @returns Boolean
 */
async function is_chat_admin(chat_id, user_id) {
    try {
        let { status } = await bot.telegram.getChatMember(chat_id, user_id)
        if (status === 'administrator' || status === 'creator') {
            return true
        }
    }
    catch (e) {
    }
    return false
}