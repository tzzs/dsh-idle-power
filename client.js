window.__ModuleLoader__.load({
  id: 'dsh-idle-power',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useCallback, useRef } = React;

    const NS = 'dsh-idle-power';
    const ROUTE_STATE = 'idle-power/state';
    const ROUTE_ARM = 'idle-power/arm';
    const ROUTE_CANCEL = 'idle-power/cancel';
    const ROUTE_MODE = 'idle-power/mode';

    // ---------------------------------------------------------------- locale
    const zh = {
      'button.tip': '空闲后休眠或关机',
      'entry.schedulePrefix': '预约',
      'entry.secondsTo': ' 秒后',
      'entry.quietSuffix': ' 秒后开始倒计时',
      'mode.hibernate.short': '休眠',
      'mode.shutdown.short': '关机',
      'panel.title': '空闲后休眠或关机',
      'panel.subtitle': '等待当前 DSH Host 的任务结束，再执行一次电源操作。',
      'panel.flow': '执行流程',
      'panel.quiet': '秒持续空闲',
      'panel.countdown': '秒可取消倒计时',
      'panel.scope': '关闭页面不会取消预约；不监测其他应用或其他 Host。',
      'panel.mode': '电源操作',
      'status.loading': '正在读取状态…',
      'status.saving': '正在提交…',
      'status.executing': '正在执行电源操作',
      'status.agents': '运行中的智能体',
      'status.inbox': '排队消息',
      'status.jobs': '后台任务',
      'countdown.cancelling': '正在取消…',
      'countdown.offline': '连接已断开，预约可能仍在执行。取消尚未确认，请重试。',
      'error.execution-in-progress': '电源操作已经开始执行，无法再取消。',
      'error.reservation-changed': '预约状态刚刚发生了变化，请重新操作。',
      'error.command-unavailable': '找不到可执行的电源命令，请检查 shutdownCommand 配置。',
      'error.agents-unavailable': '智能体注册表不可用，暂时无法预约。',
      'error.unsupported-platform': '此插件只支持 Windows。',
      'panel.hibernate': '休眠',
      'panel.hibernateDesc': '内存快照落盘，等于断电；下次开机原样恢复窗口和未保存的内容。',
      'panel.shutdown': '关机',
      'panel.shutdownDesc': '倒计时结束后关闭 Windows，DSH 对话记录仍然保留。',
      'panel.shutdownNote': '会强制关闭应用，未保存的内容可能丢失。请先保存其他应用的工作。',
      'panel.hibernateNote': '休眠后按电源键会把整机内存读回来，开着的窗口都还在。',
      'panel.arm': '预约',
      'panel.cancel': '取消预约',
      'panel.close': '关闭',
      'status.idle': '未预约',
      'status.waiting': '等待中',
      'status.tasksSuffix': ' 个任务在跑',
      'status.quietPrefix': '任务已停下，',
      'status.quietSuffix': ' 秒后开始倒计时',
      'status.counting': '倒计时中',
      'status.failed': '执行失败',
      'status.offline': '连不上插件 Host',
      'status.unsupported': '此插件只支持 Windows',
      'status.registryUnavailable': '智能体注册表不可用，已暂停倒计时',
      'countdown.title': '所有任务已完成',
      'countdown.hibernate': '将进入休眠',
      'countdown.shutdown': '将关机',
      'countdown.suffix': '秒',
      'countdown.cancel': '取消',
      'countdown.hint': '有任何新任务开始，倒计时会自动作废。',
    };
    const en = {
      'button.tip': 'Hibernate or power off when idle',
      'entry.schedulePrefix': 'Schedule ',
      'entry.secondsTo': 's to ',
      'entry.quietSuffix': 's to countdown',
      'mode.hibernate.short': 'hibernate',
      'mode.shutdown.short': 'shut down',
      'panel.title': 'Hibernate or power off when idle',
      'panel.subtitle': 'Run one power action after tasks in this DSH Host finish.',
      'panel.flow': 'How it runs',
      'panel.quiet': 's continuously idle',
      'panel.countdown': 's cancellable countdown',
      'panel.scope': 'Closing this page does not cancel. Other apps and Hosts are not monitored.',
      'panel.mode': 'Power action',
      'status.loading': 'Loading status…',
      'status.saving': 'Submitting…',
      'status.executing': 'Executing power action',
      'status.agents': 'Running agents',
      'status.inbox': 'Queued messages',
      'status.jobs': 'Background jobs',
      'countdown.cancelling': 'Cancelling…',
      'countdown.offline': 'Connection lost. The reservation may still run. Cancellation is unconfirmed; please retry.',
      'error.execution-in-progress': 'The power command is already executing and can no longer be cancelled.',
      'error.reservation-changed': 'The reservation just changed; please try again.',
      'error.command-unavailable': 'The power command could not be found; check the shutdownCommand setting.',
      'error.agents-unavailable': 'The agent registry is unavailable, so nothing can be scheduled right now.',
      'error.unsupported-platform': 'This plugin supports Windows only.',
      'panel.hibernate': 'Hibernate',
      'panel.hibernateDesc': 'Writes a memory snapshot to disk, so the next boot restores every open window and unsaved edit.',
      'panel.shutdown': 'Shut down',
      'panel.shutdownDesc': 'Shuts down Windows after the countdown. DSH conversations remain saved.',
      'panel.shutdownNote': 'Forces apps to close. Unsaved work may be lost; save your work in other apps first.',
      'panel.hibernateNote': 'After hibernating, pressing the power button reads the memory image back.',
      'panel.arm': 'Schedule',
      'panel.cancel': 'Cancel',
      'panel.close': 'Close',
      'status.idle': 'Not scheduled',
      'status.waiting': 'Waiting',
      'status.tasksSuffix': ' tasks running',
      'status.quietPrefix': 'All tasks stopped, ',
      'status.quietSuffix': 's until the countdown',
      'status.counting': 'Counting down',
      'status.failed': 'Failed',
      'status.offline': 'Cannot reach the plugin Host',
      'status.unsupported': 'This plugin supports Windows only',
      'status.registryUnavailable': 'Agent registry unavailable; countdown paused',
      'countdown.title': 'All tasks finished',
      'countdown.hibernate': 'About to hibernate',
      'countdown.shutdown': 'About to power off',
      'countdown.suffix': 's',
      'countdown.cancel': 'Cancel',
      'countdown.hint': 'Any new task voids this countdown automatically.',
    };

    // ---------------------------------------------------------------- styles
    const CSS = `
.ipa-fab{display:flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:none;border-radius:var(--dsw-radius-sm);background:0 0;color:var(--dsw-alias-label-secondary);cursor:pointer;position:relative;flex:none}
@media (hover:hover){.ipa-fab:hover{background:var(--dsw-alias-interactive-bg-hover)}}
.ipa-fab:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color);outline-offset:2px}
.ipa-fab[data-active]{color:var(--dsw-alias-brand-primary)}
.ipa-fab .ipa-dot{position:absolute;top:3px;right:3px;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-brand-primary)}
.ipa-fab[data-phase=counting] .ipa-dot{background:var(--dsw-alias-state-error-primary)}
.ipa-entry{display:flex;align-items:center;gap:8px;width:100%;min-width:0;height:36px;padding:0 12px;box-sizing:border-box;border:none;border-radius:var(--dsw-radius-md);background:0 0;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:13px;line-height:22px;text-align:left;position:relative}
@media (hover:hover){.ipa-entry:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}}
.ipa-entry:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color);outline-offset:-2px}
.ipa-entry .ipa-entryText{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ipa-entry[data-active]{color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2);font-weight:500}
.ipa-entry[data-phase=counting]{color:var(--dsw-alias-state-error-primary)}
.ipa-entry .ipa-dot{position:static;flex:none;width:6px;height:6px;border-radius:50%;background:currentColor}
.ipa-entry[data-phase=counting] .ipa-dot{background:currentColor}
.ipa-scrim{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;background-color:var(--dsw-alias-bg-mask-3);background-image:radial-gradient(circle at 50% 46%,transparent 0%,var(--dsw-alias-bg-mask-3) 72%);-webkit-backdrop-filter:blur(10px) saturate(115%);backdrop-filter:blur(10px) saturate(115%);animation:ipa-fade .2s ease-out}
@media (prefers-reduced-motion:reduce){.ipa-scrim{animation:none}}
@keyframes ipa-fade{from{opacity:0}to{opacity:1}}
.ipa-card{display:flex;flex-direction:column;align-items:center;gap:clamp(14px,2.2vmin,24px);padding:clamp(26px,3.6vmin,44px) clamp(30px,4.6vmin,60px);border-radius:var(--dsw-radius-panel);background:var(--dsw-alias-bg-overlay);border:.5px solid var(--dsw-alias-border-l2);box-shadow:var(--dsw-elevation-prominent);animation:ipa-rise .22s var(--ds-ease-out,ease-out)}
@media (prefers-reduced-motion:reduce){.ipa-card{animation:none}}
@keyframes ipa-rise{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
.ipa-eyebrow{font-size:clamp(13px,1.6vmin,15px);letter-spacing:.02em;color:var(--dsw-alias-label-secondary)}
.ipa-dial{position:relative;display:grid;place-items:center;width:clamp(180px,24vmin,280px);height:clamp(180px,24vmin,280px)}
.ipa-ring{position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg);overflow:visible}
.ipa-ringTrack{fill:none;stroke:var(--dsw-alias-border-l2);stroke-width:5}
.ipa-ringValue{fill:none;stroke:var(--dsw-alias-brand-primary);stroke-width:5;stroke-linecap:round;transition:stroke-dashoffset .3s linear,stroke .3s ease}
@media (prefers-reduced-motion:reduce){.ipa-ringValue{transition:none}}
.ipa-dial[data-urgent] .ipa-ringValue{stroke:var(--dsw-alias-state-error-primary)}
.ipa-dialCenter{display:flex;align-items:baseline;gap:clamp(4px,.8vmin,10px);color:var(--dsw-alias-label-primary)}
.ipa-count{font-size:clamp(52px,8.4vmin,104px);font-weight:600;line-height:1;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.ipa-unit{font-size:clamp(14px,1.9vmin,20px);font-weight:400;color:var(--dsw-alias-label-secondary)}
.ipa-dial[data-urgent] .ipa-dialCenter{color:var(--dsw-alias-state-error-primary)}
.ipa-dial[data-urgent] .ipa-unit{color:var(--dsw-alias-state-error-primary)}
.ipa-dial[data-urgent] .ipa-count{animation:ipa-pulse 1s ease-in-out infinite}
@media (prefers-reduced-motion:reduce){.ipa-dial[data-urgent] .ipa-count{animation:none}}
@keyframes ipa-pulse{0%,100%{opacity:1}50%{opacity:.7}}
.ipa-mode{font-size:clamp(16px,2.1vmin,20px);font-weight:600;color:var(--dsw-alias-label-primary);text-align:center}
.ipa-hint{font-size:12.5px;color:var(--dsw-alias-label-tertiary);max-width:min(78vw,420px);text-align:center;line-height:1.55;margin:0}
.ipa-cta{display:inline-flex;align-items:center;gap:10px;padding:12px 30px;border-radius:var(--dsw-radius-md);border:.5px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:clamp(14px,1.8vmin,17px);font-weight:600;cursor:pointer;box-shadow:var(--dsw-elevation-soft)}
@media (hover:hover){.ipa-cta:hover{background:var(--dsw-alias-interactive-bg-hover)}}
.ipa-cta:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color);outline-offset:3px}
.ipa-kbd{font-size:11px;font-weight:500;line-height:1;padding:3px 6px;border-radius:var(--dsw-radius-xs);border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary)}
/* --- motion: every animation here encodes a state change, not decoration --- */
.ipa-panel{transform-origin:bottom left;animation:ipa-pop .17s var(--ds-ease-out,cubic-bezier(.16,1,.3,1))}
@keyframes ipa-pop{from{opacity:0;transform:translateY(7px) scale(.975)}to{opacity:1;transform:none}}
.ipa-modeOption{transition:background-color .16s var(--ds-ease-out,ease-out),border-color .16s var(--ds-ease-out,ease-out),color .16s var(--ds-ease-out,ease-out),transform .12s var(--ds-ease-out,ease-out)}
.ipa-modeOption:active:not(:disabled){transform:scale(.994)}
.ipa-primary,.ipa-cancel,.ipa-cta,.ipa-close,.ipa-entry{transition:background-color .15s var(--ds-ease-out,ease-out),color .15s var(--ds-ease-out,ease-out),box-shadow .15s var(--ds-ease-out,ease-out),transform .12s var(--ds-ease-out,ease-out)}
.ipa-primary:active:not(:disabled),.ipa-cancel:active:not(:disabled),.ipa-cta:active{transform:scale(.982)}
/* The countdown digit replays a short settle on every second so the eye
   registers that time is still moving even when it is not looking directly. */
.ipa-count{animation:ipa-tick .32s var(--ds-ease-out,ease-out)}
@keyframes ipa-tick{from{opacity:.5;transform:translateY(-2px) scale(1.035)}to{opacity:1;transform:none}}
/* The ring is driven by a fractional remaining value, so a linear transition
   spanning one update interval makes it sweep continuously instead of stepping. */
.ipa-ringValue{transition:stroke-dashoffset .26s linear}
/* A reservation that is running its countdown breathes; one merely armed only
   blinks its dot so it is noticeable without being alarming. */
.ipa-entry[data-active] .ipa-dot{animation:ipa-blink 2.4s ease-in-out infinite}
.ipa-entry[data-phase=counting] .ipa-dot{animation:ipa-blink .9s ease-in-out infinite}
@keyframes ipa-blink{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(.8)}}
.ipa-entry[data-phase=counting]{animation:ipa-breathe 2.4s ease-in-out infinite}
@keyframes ipa-breathe{0%,100%{background-color:var(--dsw-alias-bg-layer-2)}50%{background-color:var(--dsw-alias-interactive-bg-hover)}}
@media (prefers-reduced-motion:reduce){
.ipa-panel,.ipa-count,.ipa-entry[data-active] .ipa-dot,.ipa-entry[data-phase=counting] .ipa-dot,.ipa-entry[data-phase=counting]{animation:none}
.ipa-ringValue{transition:none}
.ipa-primary,.ipa-cancel,.ipa-cta,.ipa-close,.ipa-entry,.ipa-modeOption{transition:none}
.ipa-primary:active,.ipa-cancel:active,.ipa-cta:active,.ipa-modeOption:active{transform:none}
}
.ipa-panel{position:fixed;z-index:59;left:12px;bottom:150px;width:min(320px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow-y:auto;box-sizing:border-box;display:flex;flex-direction:column;gap:12px;padding:16px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-overlay);border:.5px solid var(--dsw-alias-border-l2);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-primary);font-size:13px}
.ipa-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.ipa-title{font-size:14px;font-weight:600}
.ipa-close{flex:none;width:22px;height:22px;border:none;background:0 0;color:var(--dsw-alias-label-tertiary);cursor:pointer;border-radius:var(--dsw-radius-xs);font-size:15px;line-height:1}
@media (hover:hover){.ipa-close:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}}
.ipa-sub{color:var(--dsw-alias-label-secondary);line-height:1.55;margin-top:-4px}
.ipa-modes{display:flex;flex-direction:column;gap:8px}
.ipa-modeOption{display:flex;flex-direction:column;gap:3px;text-align:left;padding:9px 11px;border-radius:var(--dsw-radius-sm);border:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:inherit;cursor:pointer;font-size:13px}
@media (hover:hover){.ipa-modeOption:hover{background:var(--dsw-alias-interactive-bg-hover)}}
.ipa-modeOption[data-active]{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2)}
.ipa-modeOption .ipa-optionTitle{font-weight:600}
.ipa-modeOption .ipa-optionDesc{color:var(--dsw-alias-label-secondary);line-height:1.5;font-size:12px}
.ipa-note{color:var(--dsw-alias-label-tertiary);line-height:1.5;font-size:12px}
.ipa-status{padding-top:10px;border-top:.5px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);line-height:1.5}
.ipa-status[data-tone=error]{color:var(--dsw-alias-state-error-primary)}
.ipa-actions{display:flex;gap:8px}
.ipa-primary{flex:1;padding:9px 12px;border-radius:var(--dsw-radius-sm);border:.5px solid var(--dsw-alias-brand-primary);background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary-foreground);font-size:13px;font-weight:600;cursor:pointer}
.ipa-cancel{flex:1;padding:9px 12px;border-radius:var(--dsw-radius-sm);border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:13px;font-weight:600;cursor:pointer}
@media (hover:hover){.ipa-cancel:hover{background:var(--dsw-alias-interactive-bg-hover)}}
.ipa-primary:disabled,.ipa-cancel:disabled{opacity:.5;cursor:default}
.ipa-modeOption:disabled{opacity:.5;cursor:default}
.ipa-panel{width:min(360px,calc(100vw - 24px));gap:14px;overscroll-behavior:contain;overflow-wrap:anywhere}
.ipa-title{font-size:16px;line-height:1.4}
.ipa-close{width:32px;height:32px;font-size:20px}
.ipa-modeOption{padding:12px;gap:5px;min-height:44px}
.ipa-modeOption[data-active] .ipa-optionTitle::before{content:'✓';margin-right:8px;color:var(--dsw-alias-brand-primary)}
.ipa-modeOption:focus-visible,.ipa-close:focus-visible,.ipa-primary:focus-visible,.ipa-cancel:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:2px}
.ipa-primary,.ipa-cancel,.ipa-cta{min-height:44px}
.ipa-flow{display:flex;flex-direction:column;gap:4px;padding:10px 0;border-top:1px solid var(--dsw-alias-border-l1);border-bottom:1px solid var(--dsw-alias-border-l1);line-height:1.5;color:var(--dsw-alias-label-secondary)}
.ipa-flow strong{color:var(--dsw-alias-label-primary);font-weight:500}
.ipa-details{display:grid;grid-template-columns:1fr auto;gap:5px 12px;margin:0;color:var(--dsw-alias-label-secondary);font-size:12px}
.ipa-details dd{margin:0;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}
.ipa-note,.ipa-hint{color:var(--dsw-alias-label-secondary)}
.ipa-feedback{color:var(--dsw-alias-state-error-primary);font-size:13px;line-height:1.5;max-width:420px;text-align:center;overflow-wrap:anywhere}
.ipa-cta:disabled{opacity:.6;cursor:wait}
.ipa-card{box-sizing:border-box;max-width:100%;max-height:calc(100dvh - 32px);overflow-y:auto;flex-shrink:0}
.ipa-scrim{overflow-y:auto;padding:16px}
@media (max-width:480px){.ipa-card{padding:24px 20px}.ipa-entry{min-height:44px}.ipa-close{width:44px;height:44px}}
/* A committed or failed power action must not look like an idle row. */
.ipa-entry[data-phase=executing]{color:var(--dsw-alias-brand-primary)}
.ipa-entry[data-phase=failed],.ipa-fab[data-phase=failed]{color:var(--dsw-alias-state-error-primary)}
`;

    // ----------------------------------------------------------------- store
    /** Shallow compare, so an unchanged poll result does not re-render the UI. */
    function shallowEqual(left, right) {
      if (left === right) return true;
      if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) return false;
      const leftKeys = Object.keys(left);
      const rightKeys = Object.keys(right);
      if (leftKeys.length !== rightKeys.length) return false;
      for (const key of leftKeys) if (left[key] !== right[key]) return false;
      return true;
    }

    /** Smallest observable snapshot store; no external dependency needed. */
    function createStore(initial) {
      let value = initial;
      const listeners = new Set();
      return {
        getSnapshot: () => value,
        subscribe(listener) {
          listeners.add(listener);
          return () => { listeners.delete(listener); };
        },
        set(next) {
          const previous = value;
          const candidate = typeof next === 'function' ? next(previous) : next;
          if (shallowEqual(previous, candidate)) return;
          value = candidate;
          for (const listener of listeners) listener();
        },
      };
    }

    /** Fetch JSON, returning { ok, value } instead of throwing on transport failure. */
    async function requestJson(route, init) {
      // Abort a hung request so one dead connection cannot wedge the controls.
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timeout = controller === null ? null : setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(route, controller === null ? init : { ...init, signal: controller.signal });
        if (!response.ok) {
          let payload = null;
          try {
            payload = await response.json();
          } catch {
            payload = null;
          }
          return { ok: false, status: response.status, code: payload?.code ?? null, message: payload?.message ?? `HTTP ${response.status}` };
        }
        return { ok: true, value: await response.json() };
      } catch {
        return { ok: false, offline: true, message: null };
      } finally {
        if (timeout !== null) clearTimeout(timeout);
      }
    }

    const EMPTY_STATE = {
      supported: true,
      platform: 'unknown',
      phase: 'idle',
      mode: 'shutdown',
      countdownSeconds: 60,
      quietSeconds: 20,
      remainingSeconds: 0,
      quietRemainingSeconds: 0,
      deadline: null,
      busy: { available: true, agentsRunning: 0, inboxPending: 0, jobsRunning: 0, total: 0 },
      error: null,
      lastExecution: null,
    };

    // --------------------------------------------------------------- runtime
    /**
     * Poll the Host, perform the two mutations, and own the panel's open flag.
     * One poller serves both slot entries so neither duplicates transport work.
     * @param ctx - Client root context.
     * @returns store handle, actions, and the poller body.
     */
    function createRuntime(ctx) {
      const store = createStore({ data: EMPTY_STATE, ready: false, offline: false, panelOpen: false, busy: false, note: null, noteCode: null, notePhase: null, anchor: null });
      const patch = (fields) => store.set((current) => ({ ...current, ...fields }));

      let revision = 0;
      const refresh = async () => {
        if (store.getSnapshot().busy) return;
        const started = revision;
        const result = await requestJson(ROUTE_STATE, { headers: { accept: 'application/json' } });
        // A response started before a mutation must not revive a cancelled reservation.
        if (started !== revision) return;
        if (!result.ok) {
          patch({ offline: true });
          return;
        }
        // The state payload is small and flat enough that comparing it textually
        // is cheaper than re-rendering both overlay entries on every poll.
        const serialized = JSON.stringify(result.value);
        // A rejection belongs to the phase it happened in. Once the Host moves
        // on, the note is stale and must not label the new state as failed.
        if (store.getSnapshot().note !== null && result.value.phase !== store.getSnapshot().notePhase) {
          patch({ note: null, noteCode: null, notePhase: null });
        }
        if (serialized === JSON.stringify(store.getSnapshot().data)) {
          patch({ ready: true, offline: false });
          return;
        }
        patch({ data: result.value, ready: true, offline: false });
      };

      const arm = async (mode) => {
        if (store.getSnapshot().busy) return false;
        revision += 1;
        patch({ busy: true, note: null });
        const result = await requestJson(ROUTE_ARM, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mode }),
        });
        patch({ busy: false });
        if (result.ok) {
          patch({ data: result.value, ready: true, offline: false, note: null, noteCode: null, notePhase: null });
          return true;
        }
        patch({ offline: result.offline === true, note: result.message ?? null, noteCode: result.code ?? null, notePhase: store.getSnapshot().data.phase });
        return false;
      };

      const cancel = async () => {
        if (store.getSnapshot().busy) return false;
        revision += 1;
        patch({ busy: true, note: null });
        const result = await requestJson(ROUTE_CANCEL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        patch({ busy: false });
        if (result.ok) {
          patch({ data: result.value, ready: true, offline: false, note: null, noteCode: null, notePhase: null });
          return true;
        }
        patch({ offline: result.offline === true, note: result.message ?? null, noteCode: result.code ?? null, notePhase: store.getSnapshot().data.phase });
        return false;
      };

      /**
       * Persist the chosen mode on the Host. The sidebar entry and the panel
       * both read the Host mode, so a selection made here has to live there;
       * keeping it only in component state left the entry naming the old mode.
       */
      const setMode = async (mode) => {
        if (store.getSnapshot().busy) return false;
        revision += 1;
        patch({ busy: true, note: null });
        const result = await requestJson(ROUTE_MODE, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mode }),
        });
        patch({ busy: false });
        if (result.ok) {
          patch({ data: result.value, ready: true, offline: false, note: null, noteCode: null, notePhase: null });
          return true;
        }
        patch({ offline: result.offline === true, note: result.message ?? null, noteCode: result.code ?? null, notePhase: store.getSnapshot().data.phase });
        return false;
      };

      return {
        store,
        refresh,
        arm,
        cancel,
        setMode,
        // The panel is a popover anchored above its trigger: the foot row is
        // short, so a fixed offset would sit on top of the very button the user
        // just pressed. Capture the trigger rect and let the panel position
        // itself against it.
        open: (anchor) => patch({ panelOpen: true, anchor: anchor ?? null }),
        close: () => patch({ panelOpen: false }),
      };
    }

    // -------------------------------------------------------------- controls
    /** Prefer localized copy for a known Host error code; fall back to its message. */
    function describeFailure(code, message, t) {
      if (code !== null && code !== undefined) {
        const key = `error.${code}`;
        const localized = t(key);
        if (localized !== key) return localized;
      }
      return message ?? '';
    }

    /** Power glyph; deliberately geometric and theme-neutral. */
    function PowerGlyph({ size }) {
      return h('svg', {
        viewBox: '0 0 24 24',
        width: size ?? 16,
        height: size ?? 16,
        'aria-hidden': true,
        style: { display: 'block' },
      },
        h('path', {
          d: 'M12 3.2v8.1',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 2,
          strokeLinecap: 'round',
        }),
        h('path', {
          d: 'M6.4 6.6a8.1 8.1 0 1 0 11.2 0',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 2,
          strokeLinecap: 'round',
        }),
      );
    }

    /**
     * Sidebar-foot trigger. Expanded sidebar renders a full-width row with a
     * readable label, because a bare 28px glyph beside the plugin button is
     * effectively invisible. A live reservation also changes the row's colour,
     * so a pending power action can never be forgotten in the corner.
     */
    function PowerButton({ usePower, open, t, wide }) {
      const { data, offline, panelOpen } = usePower((current) => current);
      const active = data.phase === 'armed' || data.phase === 'counting';
      const counting = data.phase === 'counting';
      // Hand the trigger's own rect to the panel so it opens above this row
      // instead of over it.
      const openHere = (event) => {
        const rect = event?.currentTarget?.getBoundingClientRect?.();
        open(rect === undefined ? null : { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right });
      };

      if (!wide) {
        const dotLabel = !data.supported
          ? t('status.unsupported')
          : offline
            ? t('status.offline')
            : data.busy?.available === false
              ? t('status.registryUnavailable')
              : counting
              ? t('status.counting')
              : active
                ? t('status.waiting')
                : t('button.tip');
        return h('button', {
          type: 'button',
          className: 'ipa-fab',
          'data-ipa-trigger': '',
          'aria-label': dotLabel,
          'aria-haspopup': 'dialog',
          'aria-expanded': Boolean(panelOpen),
          title: dotLabel,
          'data-active': active || undefined,
          'data-phase': data.phase,
          onClick: openHere,
        },
          h(PowerGlyph, { size: 16 }),
          active && h('span', { className: 'ipa-dot', 'aria-hidden': 'true' }),
        );
      }

      // Name the action that will actually run. "预约关机" alone was wrong:
      // hibernate is the default mode, and it is not a shutdown.
      const modeName = data.mode === 'shutdown' ? t('mode.shutdown.short') : t('mode.hibernate.short');
      let text;
      if (!data.supported) text = t('status.unsupported');
      else if (offline) text = t('status.offline');
      else if (data.busy?.available === false) text = t('status.registryUnavailable');
      else if (data.phase === 'failed') text = t('status.failed');
      else if (data.phase === 'executing') text = t('status.executing');
      else if (counting) text = `${data.remainingSeconds}${t('entry.secondsTo')}${modeName}`;
      else if (active && data.busy.total > 0)
        text = `${t('status.waiting')} · ${data.busy.total}${t('status.tasksSuffix')}`;
      else if (active) text = `${t('status.waiting')} · ${data.quietRemainingSeconds}${t('entry.quietSuffix')}`;
      else text = `${t('entry.schedulePrefix')}${modeName}`;

      return h('button', {
        type: 'button',
        className: 'ipa-entry',
        'data-ipa-trigger': '',
        'aria-label': text,
        'aria-haspopup': 'dialog',
        'aria-expanded': Boolean(panelOpen),
        title: text,
        'data-active': active || undefined,
        'data-phase': data.phase,
        onClick: openHere,
      },
        h(PowerGlyph, { size: 15 }),
        h('span', { className: 'ipa-entryText' }, text),
        active && h('span', { className: 'ipa-dot', 'aria-hidden': 'true' }),
      );
    }

    /** The scheduling panel: mode choice, live status, arm and cancel. */
    function PowerPanel({ usePower, arm, cancel, setMode, close, t }) {
      const { data, ready, offline, busy, note, noteCode, anchor } = usePower((current) => current);
      const panelRef = useRef(null);
      useEffect(() => {
        const previous = document.activeElement;
        panelRef.current?.focus?.();
        const onKey = (event) => {
          if (event.key === 'Escape') { close(); previous?.focus?.(); }
        };
        // A pointer press anywhere outside the card dismisses it, the way every
        // other popover in this app behaves.
        const onPress = (event) => {
          const target = event.target;
          if (panelRef.current !== null && panelRef.current.contains?.(target) === true) return;
          if (typeof target?.closest === 'function' && target.closest('[data-ipa-trigger]') !== null) return;
          close();
        };
        window.addEventListener('keydown', onKey);
        window.addEventListener('pointerdown', onPress, true);
        return () => {
          window.removeEventListener('keydown', onKey);
          window.removeEventListener('pointerdown', onPress, true);
        };
      }, [close]);

      // Open above the trigger row. Falling back to the old fixed offset keeps
      // the panel usable if the rect was never captured.
      const hasAnchor = anchor !== null && anchor !== undefined && Number.isFinite(anchor.top) && Number.isFinite(anchor.left);
      const viewportWidth = typeof window === 'undefined' ? 1200 : window.innerWidth;
      const viewportHeight = typeof window === 'undefined' ? 800 : window.innerHeight;
      const placement = hasAnchor
        ? {
          left: Math.max(8, Math.min(anchor.left, viewportWidth - 372)),
          bottom: anchor.top < 360 ? 12 : Math.max(12, viewportHeight - anchor.top + 8),
        }
        : { left: 12, bottom: 150 };

      const mode = data.mode;
      const armed = data.phase === 'armed' || data.phase === 'counting';
      const locked = data.phase === 'executing';

      let statusText;
      let statusTone = 'normal';
      if (!data.supported) statusText = t('status.unsupported');
      else if (note !== null) {
        statusText = `${t('status.failed')}: ${describeFailure(noteCode, note, t)}`;
        statusTone = 'error';
      } else if (offline) { statusText = t('status.offline'); statusTone = 'error'; }
      else if (!ready) statusText = t('status.loading');
      else if (data.busy?.available === false) { statusText = t('status.registryUnavailable'); statusTone = 'error'; }
      else if (data.phase === 'failed') {
        statusText = `${t('status.failed')}: ${data.error ?? ''}`;
        statusTone = 'error';
      } else if (data.phase === 'counting') statusText = `${t('status.counting')} · ${data.remainingSeconds}${t('countdown.suffix')}`;
      else if (data.phase === 'armed' && data.busy.total > 0)
        statusText = `${t('status.waiting')} · ${data.busy.total}${t('status.tasksSuffix')}`;
      else if (data.phase === 'armed')
        statusText = `${t('status.quietPrefix')}${data.quietRemainingSeconds}${t('status.quietSuffix')}`;
      else if (data.phase === 'executing') statusText = t('status.executing');
      else statusText = t('status.idle');

      const option = (value, titleKey, descKey, noteKey) => h('button', {
        type: 'button',
        className: 'ipa-modeOption',
        'data-active': mode === value || undefined,
        disabled: locked || busy || !ready || offline || !data.supported || data.busy?.available === false,
        tabIndex: mode === value ? 0 : -1,
        onKeyDown: (event) => {
          if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const choices = Array.from(event.currentTarget.parentElement.querySelectorAll('[role="radio"]'));
          const target = event.key === 'Home' ? choices[0] : event.key === 'End' ? choices[1] : choices.find((item) => item !== event.currentTarget);
          target?.focus();
          target?.click();
        },
        onClick: () => {
          if (value === data.mode) return;
          // While reserved, changing the mode re-arms with it; while idle it
          // just records what 预约 would do, so the entry label follows.
          if (armed) void arm(value);
          else void setMode(value);
        },
        role: 'radio',
        'aria-checked': mode === value,
      },
        h('span', { className: 'ipa-optionTitle' }, t(titleKey)),
        h('span', { className: 'ipa-optionDesc' }, t(descKey)),
        mode === value && noteKey !== undefined && h('span', { className: 'ipa-note' }, t(noteKey)),
      );

      return h('div', {
        className: 'ipa-panel',
        ref: panelRef,
        role: 'dialog',
        tabIndex: -1,
        'aria-label': t('panel.title'),
        'aria-busy': busy,
        style: { left: `${placement.left}px`, bottom: `${placement.bottom}px`, maxHeight: `${Math.max(80, viewportHeight - placement.bottom - 12)}px` },
      },
        h('div', { className: 'ipa-head' },
          h('span', { className: 'ipa-title' }, t('panel.title')),
          h('button', {
            type: 'button',
            className: 'ipa-close',
            'aria-label': t('panel.close'),
            onClick: close,
          }, '\u00d7'),
        ),
        h('div', { className: 'ipa-sub' }, t('panel.subtitle')),
        h('div', { className: 'ipa-modes', role: 'radiogroup', 'aria-label': t('panel.mode') },
          option('hibernate', 'panel.hibernate', 'panel.hibernateDesc', 'panel.hibernateNote'),
          option('shutdown', 'panel.shutdown', 'panel.shutdownDesc', 'panel.shutdownNote'),
        ),
        h('div', { className: 'ipa-flow', 'aria-label': t('panel.flow') },
          h('strong', null, `${data.quietSeconds} ${t('panel.quiet')} → ${data.countdownSeconds} ${t('panel.countdown')}`),
          h('span', { className: 'ipa-note' }, t('panel.scope')),
        ),
        h('div', { className: 'ipa-status', 'data-tone': statusTone, role: 'status' }, statusText),
        armed && data.busy.total > 0 && h('dl', { className: 'ipa-details' },
          [['agentsRunning', 'status.agents'], ['inboxPending', 'status.inbox'], ['jobsRunning', 'status.jobs']]
            .flatMap(([key, label]) => [
              h('dt', { key: `${key}-t` }, t(label)),
              h('dd', { key: `${key}-d` }, String(data.busy[key] ?? 0)),
            ]),
        ),
        // Exactly one primary action: arm while idle, cancel while reserved.
        // Showing both at once was the reason an armed reservation still looked
        // unarmed.
        h('div', { className: 'ipa-actions' },
          armed
            ? h('button', {
              type: 'button',
              className: 'ipa-cancel',
              disabled: busy,
              onClick: () => { void cancel(); },
            }, t(busy ? 'countdown.cancelling' : 'panel.cancel'))
            : h('button', {
              type: 'button',
              className: 'ipa-primary',
              disabled: busy || !ready || offline || !data.supported || locked || data.busy?.available === false,
              onClick: () => { void arm(mode); },
            }, t(locked ? 'status.executing' : busy ? 'status.saving' : 'panel.arm')),
        ),
      );
    }

    /** Full-frame countdown; the only cancel affordance before an irreversible action. */
    function PowerCountdown({ usePower, cancel, t }) {
      const { data, busy, offline, note, noteCode } = usePower((current) => current);
      const cancelRef = useRef(null);
      const [now, setNow] = useState(() => Date.now());

      useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 250);
        return () => clearInterval(timer);
      }, []);

      const cancelCountdown = useCallback(() => { if (!busy) void cancel(); }, [cancel, busy]);

      useEffect(() => {
        const previous = document.activeElement;
        cancelRef.current?.focus?.();
        return () => { if (previous?.isConnected) previous.focus?.(); };
      }, []);

      useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape') { event.preventDefault?.(); cancelCountdown(); }
          if (event.key === 'Tab') { event.preventDefault?.(); cancelRef.current?.focus?.(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [cancelCountdown]);

      const deadline = data.deadline;
      const remaining = deadline === null ? data.remainingSeconds : Math.max(0, Math.ceil((deadline - now) / 1000));
      // The ring uses the un-rounded remainder so it moves on every 250ms tick;
      // the digits keep the rounded value a person can read.
      const exactRemaining = deadline === null ? remaining : Math.max(0, (deadline - now) / 1000);
      const urgent = remaining <= 10;
      const total = data.countdownSeconds > 0 ? data.countdownSeconds : remaining;
      // A dial rather than bare digits: the sweep is the only cue for how much
      // of the window has already gone, which digits alone cannot show.
      const RADIUS = 54;
      const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
      const fraction = total > 0 ? Math.min(1, Math.max(0, exactRemaining / total)) : 0;
      const action = data.mode === 'hibernate' ? t('countdown.hibernate') : t('countdown.shutdown');

      return h('div', {
        className: 'ipa-scrim',
        role: 'alertdialog',
        'aria-modal': true,
        'aria-label': t('countdown.title'),
      },
        h('div', { className: 'ipa-card' },
          h('div', { className: 'ipa-eyebrow' }, t('countdown.title')),
          h('div', { className: 'ipa-dial', 'data-urgent': urgent || undefined },
            h('svg', { className: 'ipa-ring', viewBox: '0 0 120 120', 'aria-hidden': true },
              h('circle', { className: 'ipa-ringTrack', cx: 60, cy: 60, r: RADIUS }),
              h('circle', {
                className: 'ipa-ringValue',
                cx: 60,
                cy: 60,
                r: RADIUS,
                'stroke-dasharray': CIRCUMFERENCE,
                'stroke-dashoffset': CIRCUMFERENCE * (1 - fraction),
              }),
            ),
            h('div', { className: 'ipa-dialCenter' },
              // Re-keying on the whole second restarts the tick animation, which
              // is what makes the digit visibly settle once per second.
              h('span', { className: 'ipa-count', key: remaining }, String(remaining)),
              h('span', { className: 'ipa-unit' }, t('countdown.suffix')),
            ),
          ),
          h('div', { className: 'ipa-mode' }, action),
          h('button', {
            type: 'button',
            className: 'ipa-cta',
            ref: cancelRef,
            'aria-disabled': Boolean(busy),
            onClick: cancelCountdown,
            autoFocus: true,
          },
            t(busy ? 'countdown.cancelling' : 'countdown.cancel'),
            h('kbd', { className: 'ipa-kbd' }, 'Esc'),
          ),
          (offline || note) && h('div', { className: 'ipa-feedback', role: 'alert' }, offline ? t('countdown.offline') : `${t('status.failed')}: ${describeFailure(noteCode, note, t)}`),
          h('div', { className: 'ipa-hint' }, t('countdown.hint')),
          data.mode === 'shutdown' && h('div', { className: 'ipa-hint' }, t('panel.shutdownNote')),
        ),
      );
    }

    // ----------------------------------------------------------------- mount
    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const runtime = createRuntime(ctx);

        ctx.effect(() => {
          const tag = document.createElement('style');
          tag.dataset.plugin = 'dsh-idle-power';
          tag.dataset.pluginCss = 'dsh-idle-power/dsh-idle-power.css';
          tag.textContent = CSS;
          document.head.appendChild(tag);
          return () => { tag.remove(); };
        }, 'dsh-idle-power: stylesheet');

        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-idle-power: dictionaries');

        // One poller for both entries: 1s while armed, a slow 3s otherwise.
        ctx.effect(() => {
          let disposed = false;
          let timer;
          const tick = async () => {
            if (disposed) return;
            await runtime.refresh();
            if (disposed) return;
            const phase = runtime.store.getSnapshot().data.phase;
            const active = phase === 'armed' || phase === 'counting' || phase === 'executing';
            timer = setTimeout(tick, active ? 1000 : 3000);
          };
          tick();
          return () => {
            disposed = true;
            clearTimeout(timer);
          };
        }, 'dsh-idle-power: poller');

        ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action',
          id: 'dsh-idle-power',
          order: 10,
          locale: NS,
          inject: () => ({ hooks: { power: runtime.store }, open: runtime.open }),
        }, PowerButton));

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'dsh-idle-power.panel',
          order: 10,
          locale: NS,
          inject: () => ({
            hooks: { power: runtime.store },
            arm: runtime.arm,
            cancel: runtime.cancel,
            setMode: runtime.setMode,
            close: runtime.close,
          }),
        }, function PanelWhenOpen({ usePower, ...rest }) {
          const { panelOpen } = usePower((current) => current);
          return panelOpen ? h(PowerPanel, { usePower, ...rest }) : null;
        }));

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'dsh-idle-power.countdown',
          order: 100,
          locale: NS,
          inject: () => ({
            hooks: { power: runtime.store },
            cancel: runtime.cancel,
          }),
        }, function CountdownWhenCounting({ usePower, ...rest }) {
          const { data } = usePower((current) => current);
          return data.phase === 'counting' ? h(PowerCountdown, { usePower, ...rest }) : null;
        }));
      },
    };
  },
});
