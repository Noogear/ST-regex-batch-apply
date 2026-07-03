const EXTENSION_NAME = 'regex-tool';

let _busy = false;

async function getRegexEngine() {
    try { return await import('/scripts/extensions/regex/engine.js'); } catch { return null; }
}

async function getScriptMod() {
    try { return await import('/script.js'); } catch { return null; }
}

async function getPopup() {
    try { return await import('/scripts/popup.js'); } catch { return null; }
}

function getRegexPlacement(mes) {
    if (mes?.is_user) return 1;
    if (mes?.extra?.type === 'narrator') return 3;
    return 2;
}

function shouldSkipMessage(mes) {
    if (!mes) return true;
    if (mes.is_system) return true;
    if (typeof mes.mes !== 'string') return true;
    return false;
}

async function doBatchApply(dryRun) {
    if (_busy) { toastr.warning('操作进行中，请稍后'); return; }
    _busy = true;

    try {
        const engine = await getRegexEngine();
        const sm = await getScriptMod();
        if (!engine || !sm) { toastr.error('模块加载失败'); return; }

        const { chat, getCurrentChatId, saveChatConditional } = sm;
        if (!getCurrentChatId()) { toastr.warning('未加载聊天'); return; }

        const scripts = engine.getRegexScripts({ allowedOnly: true })?.filter(s => !s.disabled);
        if (!scripts?.length) { toastr.warning('无启用的正则脚本'); return; }

        let modified = 0;
        for (let i = 0; i < chat.length; i++) {
            const mes = chat[i];
            if (shouldSkipMessage(mes)) continue;

            const placement = getRegexPlacement(mes);
            const originalText = mes.mes;
            let text = originalText;

            for (const s of scripts) {
                if (!s.placement?.includes(placement)) continue;
                const result = engine.getRegexedString(text, placement, {
                    characterOverride: mes.extra?.type === 'narrator' ? undefined : mes.name,
                    isEdit: false, isMarkdown: false, isPrompt: false,
                });
                if (typeof result === 'string') text = result;
            }

            if (text !== originalText) {
                modified++;
                if (!dryRun) {
                    chat[i].mes = text;
                    if (Array.isArray(mes.swipes) && typeof mes.swipe_id === 'number' && mes.swipe_id >= 0 && mes.swipe_id < mes.swipes.length) {
                        mes.swipes[mes.swipe_id] = text;
                    }
                }
            }
        }

        if (dryRun) {
            if (modified > 0) toastr.info(`[预览] 将修改 ${modified} 条消息`);
            else toastr.info('[预览] 无需修改');
        } else if (modified > 0) {
            try {
                await saveChatConditional();
                toastr.success(`已修改 ${modified} 条消息`);
            } catch {
                toastr.error('保存失败，内存中已修改但未持久化');
            }
        } else {
            toastr.info('无需修改');
        }
    } finally {
        _busy = false;
    }
}

async function doCleanLines(dryRun) {
    if (_busy) { toastr.warning('操作进行中，请稍后'); return; }
    _busy = true;

    try {
        const sm = await getScriptMod();
        if (!sm) { toastr.error('模块加载失败'); return; }

        const { chat, getCurrentChatId, saveChatConditional } = sm;
        if (!getCurrentChatId()) { toastr.warning('未加载聊天'); return; }

        let removed = 0, affected = 0;
        for (let i = 0; i < chat.length; i++) {
            const mes = chat[i];
            if (shouldSkipMessage(mes)) continue;

            const lines = mes.mes.split(/\r?\n/);
            const cleaned = lines.filter(l => l.trim() !== '');
            const count = lines.length - cleaned.length;

            if (count > 0) {
                removed += count;
                affected++;
                if (!dryRun) {
                    chat[i].mes = cleaned.join('\n');
                    if (Array.isArray(mes.swipes) && typeof mes.swipe_id === 'number' && mes.swipe_id >= 0 && mes.swipe_id < mes.swipes.length) {
                        mes.swipes[mes.swipe_id] = cleaned.join('\n');
                    }
                }
            }
        }

        if (dryRun) {
            if (removed > 0) toastr.info(`[预览] 将清理 ${removed} 处空行，涉及 ${affected} 条消息`);
            else toastr.info('[预览] 无需清理');
        } else if (removed > 0) {
            try {
                await saveChatConditional();
                toastr.success(`已清理 ${removed} 处空行，涉及 ${affected} 条消息`);
            } catch {
                toastr.error('保存失败，内存中已修改但未持久化');
            }
        } else {
            toastr.info('无需清理');
        }
    } finally {
        _busy = false;
    }
}

function renderPanel() {
    if (document.getElementById('rba_container')) return;
    const host = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    if (!host) return;

    const html = `
    <div id="rba_container" class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
            <b>历史消息工具</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
            <small>建议先点「预览」确认变更，再点「执行」</small>
            <hr />
            <div>
                <strong>正则批量替换</strong><br>
                <small>将已启用的正则脚本应用到所有历史消息，直接修改存储内容</small>
            </div>
            <div class="flex-container flexGap5">
                <div id="rba_regex_preview" class="menu_button menu_button_icon" title="预览模式">
                    <i class="fa-solid fa-eye"></i>
                    <small>预览</small>
                </div>
                <div id="rba_regex_run" class="menu_button menu_button_icon" title="执行替换">
                    <i class="fa-solid fa-play"></i>
                    <small>执行</small>
                </div>
            </div>
            <hr />
            <div>
                <strong>清理空行</strong><br>
                <small>移除消息中仅含换行符或空白字符的空行</small>
            </div>
            <div class="flex-container flexGap5">
                <div id="rba_clean_preview" class="menu_button menu_button_icon" title="预览模式">
                    <i class="fa-solid fa-eye"></i>
                    <small>预览</small>
                </div>
                <div id="rba_clean_run" class="menu_button menu_button_icon" title="执行清理">
                    <i class="fa-solid fa-play"></i>
                    <small>执行</small>
                </div>
            </div>
        </div>
    </div>`;

    host.insertAdjacentHTML('beforeend', html);

    document.getElementById('rba_regex_preview')?.addEventListener('click', () => doBatchApply(true));
    document.getElementById('rba_regex_run')?.addEventListener('click', async () => {
        const popup = await getPopup();
        const result = popup ? await popup.Popup.show.confirm('确定执行正则替换？', '此操作不可撤销。') : confirm('确定执行正则替换？此操作不可撤销。');
        if (result) await doBatchApply(false);
    });
    document.getElementById('rba_clean_preview')?.addEventListener('click', () => doCleanLines(true));
    document.getElementById('rba_clean_run')?.addEventListener('click', async () => {
        const popup = await getPopup();
        const result = popup ? await popup.Popup.show.confirm('确定清理空行？', '此操作不可撤销。') : confirm('确定清理空行？此操作不可撤销。');
        if (result) await doCleanLines(false);
    });
}

export async function init() {
    renderPanel();
    console.log(`[${EXTENSION_NAME}] loaded`);
}
