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
      'panel.subtitle': '等所有任务停下来之后再执行，不会被硬关机打断。',
      'panel.hibernate': '休眠',
      'panel.hibernateDesc': '内存快照落盘，等于断电；下次开机原样恢复窗口和未保存的内容。',
      'panel.shutdown': '关机',
      'panel.shutdownDesc': '立即断电；下次开机是全新状态，DSH 里的对话记录仍然保留。',
      'panel.shutdownNote': '本机快速启动已开启，这次关机会是混合关机。需要真正的冷启动，请另运行 powercfg /h off。',
      'panel.hibernateNote': '休眠后按电源键会把整机内存读回来，开着的窗口都还在。',
      'panel.arm': '预约',
      'panel.cancel': '取消预约',
      'panel.close': '关闭',
      'panel.dismiss': '知道了',
      'status.idle': '未预约',
      'status.waiting': '等待中',
      'status.tasksSuffix': ' 个任务在跑',
      'status.quietPrefix': '任务已停下，',
      'status.quietSuffix': ' 秒后开始倒计时',
      'status.counting': '倒计时中',
      'status.failed': '执行失败',
      'status.offline': '连不上插件 Host',
      'status.unsupported': '此插件只支持 Windows',
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
      'panel.subtitle': 'Runs once every task has stopped, so nothing is cut off.',
      'panel.hibernate': 'Hibernate',
      'panel.hibernateDesc': 'Writes a memory snapshot to disk, so the next boot restores every open window and unsaved edit.',
      'panel.shutdown': 'Shut down',
      'panel.shutdownDesc': 'Powers off immediately; the next boot is a fresh session, though DSH conversations stay saved.',
      'panel.shutdownNote': 'Fast Startup is enabled on this machine, so this is a hybrid shutdown. For a truly cold boot, run powercfg /h off separately.',
      'panel.hibernateNote': 'After hibernating, pressing the power button reads the memory image back.',
      'panel.arm': 'Schedule',
      'panel.cancel': 'Cancel',
      'panel.close': 'Close',
      'panel.dismiss': 'Dismiss',
      'status.idle': 'Not scheduled',
      'status.waiting': 'Waiting',
      'status.tasksSuffix': ' tasks running',
      'status.quietPrefix': 'All tasks stopped, ',
      'status.quietSuffix': 's until the countdown',
      'status.counting': 'Counting down',
      'status.failed': 'Failed',
      'status.offline': 'Cannot reach the plugin Host',
      'status.unsupported': 'This plugin supports Windows only',
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
      try {
        const response = await fetch(route, init);
        if (!response.ok) {
          let payload = null;
          try {
            payload = await response.json();
          } catch {
            payload = null;
          }
          return { ok: false, status: response.status, message: payload?.message ?? `HTTP ${response.status}` };
        }
        return { ok: true, value: await response.json() };
      } catch {
        return { ok: false, offline: true, message: null };
      }
    }

    const EMPTY_STATE = {
      supported: true,
      platform: 'unknown',
      phase: 'idle',
      mode: 'hibernate',
      countdownSeconds: 60,
      quietSeconds: 20,
      remainingSeconds: 0,
      quietRemainingSeconds: 0,
      deadline: null,
      busy: { agentsRunning: 0, inboxPending: 0, jobsRunning: 0, total: 0 },
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
      const store = createStore({ data: EMPTY_STATE, ready: false, offline: false, panelOpen: false, busy: false, note: null, anchor: null });
      const patch = (fields) => store.set((current) => ({ ...current, ...fields }));

      const refresh = async () => {
        const result = await requestJson(ROUTE_STATE, { headers: { accept: 'application/json' } });
        if (!result.ok) {
          patch({ offline: true });
          return;
        }
        // The state payload is small and flat enough that comparing it textually
        // is cheaper than re-rendering both overlay entries on every poll.
        const serialized = JSON.stringify(result.value);
        if (serialized === JSON.stringify(store.getSnapshot().data)) return;
        patch({ data: result.value, ready: true, offline: false });
      };

      const arm = async (mode) => {
        patch({ busy: true, note: null });
        const result = await requestJson(ROUTE_ARM, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mode }),
        });
        patch({ busy: false });
        if (result.ok) {
          patch({ data: result.value, ready: true, offline: false, note: null });
          return true;
        }
        patch({ offline: result.offline === true, note: result.message ?? null });
        return false;
      };

      const cancel = async () => {
        patch({ busy: true, note: null });
        const result = await requestJson(ROUTE_CANCEL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        patch({ busy: false });
        if (result.ok) {
          patch({ data: result.value, ready: true, offline: false, note: null });
          return true;
        }
        patch({ offline: result.offline === true, note: result.message ?? null });
        return false;
      };

      /**
       * Persist the chosen mode on the Host. The sidebar entry and the panel
       * both read the Host mode, so a selection made here has to live there;
       * keeping it only in component state left the entry naming the old mode.
       */
      const setMode = async (mode) => {
        patch({ busy: true, note: null });
        const result = await requestJson(ROUTE_MODE, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mode }),
        });
        patch({ busy: false });
        if (result.ok) {
          patch({ data: result.value, ready: true, offline: false, note: null });
          return true;
        }
        patch({ offline: result.offline === true, note: result.message ?? null });
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
      const { data, offline } = usePower((current) => current);
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
      const { data, ready, offline, busy, note, anchor } = usePower((current) => current);
      const panelRef = useRef(null);
      useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape') close();
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
          left: Math.max(8, Math.min(anchor.left, viewportWidth - 336)),
          bottom: Math.max(8, viewportHeight - anchor.top + 8),
        }
        : { left: 12, bottom: 150 };

      const mode = data.mode;
      const armed = data.phase === 'armed' || data.phase === 'counting';
      const locked = data.phase === 'executing';

      let statusText;
      let statusTone = 'normal';
      if (!data.supported) statusText = t('status.unsupported');
      else if (note !== null) {
        statusText = `${t('status.failed')}: ${note}`;
        statusTone = 'error';
      } else if (!ready && offline) statusText = t('status.offline');
      else if (data.phase === 'failed') {
        statusText = `${t('status.failed')}: ${data.error ?? ''}`;
        statusTone = 'error';
      } else if (data.phase === 'counting') statusText = t('status.counting');
      else if (data.phase === 'armed' && data.busy.total > 0)
        statusText = `${t('status.waiting')} · ${data.busy.total}${t('status.tasksSuffix')}`;
      else if (data.phase === 'armed')
        statusText = `${t('status.quietPrefix')}${data.quietRemainingSeconds}${t('status.quietSuffix')}`;
      else if (data.phase === 'executing') statusText = t('status.counting');
      else statusText = t('status.idle');

      const option = (value, titleKey, descKey, noteKey) => h('button', {
        type: 'button',
        className: 'ipa-modeOption',
        'data-active': mode === value || undefined,
        disabled: locked,
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
        'aria-label': t('panel.title'),
        style: { left: `${placement.left}px`, bottom: `${placement.bottom}px` },
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
        h('div', { className: 'ipa-modes', role: 'radiogroup' },
          option('hibernate', 'panel.hibernate', 'panel.hibernateDesc', 'panel.hibernateNote'),
          option('shutdown', 'panel.shutdown', 'panel.shutdownDesc', 'panel.shutdownNote'),
        ),
        h('div', { className: 'ipa-status', 'data-tone': statusTone }, statusText),
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
            }, t('panel.cancel'))
            : h('button', {
              type: 'button',
              className: 'ipa-primary',
              disabled: busy || !data.supported || locked,
              onClick: () => { void arm(mode); },
            }, t('panel.arm')),
        ),
      );
    }

    /** Full-frame countdown; the only cancel affordance before an irreversible action. */
    function PowerCountdown({ usePower, cancel, t }) {
      const { data } = usePower((current) => current);
      const [now, setNow] = useState(() => Date.now());

      useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 250);
        return () => clearInterval(timer);
      }, []);

      const cancelCountdown = useCallback(() => { void cancel(); }, [cancel]);

      useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape') cancelCountdown();
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
            onClick: cancelCountdown,
            autoFocus: true,
          },
            t('countdown.cancel'),
            h('kbd', { className: 'ipa-kbd' }, 'Esc'),
          ),
          h('div', { className: 'ipa-hint' }, t('countdown.hint')),
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
