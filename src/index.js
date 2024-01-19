(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD 环境
        define([], factory);
    } else if (typeof exports === 'object' && typeof module === 'object') {
        // CommonJS 环境
        module.exports = factory();
    } else {
        // 浏览器全局变量
        root.IPC = factory();
    }
})(this, function () {
    const EVENT_NAME = {
        ready: '$ready$',
        destory: '$destory$',
        transfer: '$transfer$',
    };

    function Queue() {
        this.queue = [];
    }

    Queue.prototype.enqueue = function (fn) {
        this.queue.push(fn);
    };

    Queue.prototype.dequeue = function () {
        return this.queue.shift();
    };

    Queue.prototype.flush = function () {
        const queue = this.queue;

        let i = 0,
            len = queue.length;
        for (; i < len; i++) {
            queue[i]();
        }

        this.queue = this.queue.slice(len);
    };

    function IPC({id, win}) {
        const that = this;
        this.id = id;
        this.win = win;
        this.href = win.location.href;

        this.list = [
            {
                id: this.id,
                href: this.href,
            },
        ];

        this.events = {
            $ready$: [this._readyListener],
            $destory$: [this._destoryListener],
            $transfer$: [this._transferListener],
        };

        this.win.addEventListener(
            'message',
            function (event) {
                const dataStr = event.data;
                const data = JSON.parse(dataStr);

                const {type, oriArgs, capture, toId} = data;

                if (type === EVENT_NAME.transfer) {
                    that._dispatch(type, data);
                    return;
                }

                if (type === EVENT_NAME.ready || type === EVENT_NAME.destory) {
                    that._dispatch(type, oriArgs);
                    return;
                }

                if (!toId) {
                    that._dispatch(type, oriArgs);

                    if (capture) {
                        that.notify(type, oriArgs);
                    } else {
                        that.report(type, oriArgs);
                    }

                    return;
                }

                // 桥转发 notify 时
                if (toId && toId !== that.id) {
                    that.notify(type, oriArgs, toId);

                    return;
                }

                if (toId && toId === that.id) {
                    that._dispatch(type, oriArgs);

                    return;
                }
            },
            false
        );

        this.win.addEventListener('load', function () {
            that._ready();
        });

        if (this.win.document.readyState === 'complete') {
            that._ready();
        }
    }

    IPC.prototype = new Queue();

    IPC.prototype._dispatch = function (type, params) {
        const that = this;
        const listeners = that.events[type] || [];

        for (let i = 0; i < listeners.length; i++) {
            const listener = listeners[i];

            listener.call(that, params);
        }
    };

    IPC.prototype._hasIpc = function (id) {
        const that = this;
        return that._getIpcIdx(id) !== -1;
    };

    IPC.prototype._getIpcIdx = function (id) {
        const that = this;
        const ipc = that.list.findIndex(function (item) {
            return item.id === id;
        });

        return ipc;
    };

    IPC.prototype._getIpc = function (id) {
        const that = this;
        const ipc = that.list.find(function (item) {
            return item.id === id;
        });

        return ipc;
    };

    IPC.prototype._readyListener = function (params) {
        const that = this;

        if (that._isTop()) {
            const ipc = that._getIpc(params.id);

            if (!!ipc) {
                const msg = `IPC (${ipc.href}) 与 IPC (${params.href}) 的 ID 重复了，请确保每一个 IPC ID 都是唯一的`;

                // throw new Error(msg);
                console.error(msg);
            } else {
                that.list.push({
                    id: params.id,
                    href: params.href,
                });

                that.flush();
            }
        } else {
            that._ready(params.id, params.win);
        }
    };

    IPC.prototype._destoryListener = function (params) {
        const that = this;

        params = JSON.parse(params);

        if (!that._isTop()) {
            that.report(EVENT_NAME.destory, params);
        } else {
            const id = params.id;

            const destoriedIdList = that.list
                .filter(function (item) {
                    if (item.id === id) {
                        return true;
                    }

                    if (item.id.indexOf(id) === 0) {
                        return true;
                    }

                    return false;
                })
                .map(function (item) {
                    return item.id;
                });

            if (destoriedIdList.length > 0) {
                const res = [];
                for (let i = 0; i < that.list; i++) {
                    if (destoriedIdList.indexOf(that.list.id) === -1) {
                        res.push(that.list[i]);
                    }
                }

                that.list = res;
            }
        }
    };

    IPC.prototype._hasReady = function (id) {
        const that = this;

        const ipc = that.list.find(function (item) {
            return item.id === id;
        });

        return !!ipc;
    };

    IPC.prototype._transferListener = function (argv) {
        const that = this;

        const {capture, oriArgs, toId} = argv;
        if (!capture) {
            if (that._isTop()) {
                // List 中是否存在 toId
                if (toId) {
                    if (that._hasReady(toId)) {
                        that.notify(oriArgs.type, oriArgs.params, toId);
                    } else {
                        const fn = function () {
                            if (that._hasReady(toId)) {
                                that.notify(oriArgs.type, oriArgs.params, toId);
                            } else {
                                that.enqueue(fn);
                            }
                        };

                        that.enqueue(fn);
                    }
                } else {
                    that.notify(oriArgs.type, oriArgs.params, toId);
                }
            } else {
                that.report(EVENT_NAME.transfer, oriArgs, toId);
            }
        } else {
            that.notify(EVENT_NAME.transfer, oriArgs, toId);
        }
    };

    IPC.prototype._transfer = function (toId, type, params = {}) {
        const that = this;

        if (that._isTop()) {
            that.notify(
                EVENT_NAME.transfer,
                {
                    type: type,
                    params,
                    toId: toId,
                },
                toId
            );
        } else {
            that.report(
                EVENT_NAME.transfer,
                {
                    type: type,
                    params,
                },
                toId
            );
        }
    };

    IPC.prototype._isTop = function () {
        return this.win.self === this.win.top;
    };

    IPC.prototype.report = function (type, params, toId) {
        if (this._isTop()) {
            return;
        }

        const that = this;

        const data = {
            type: type,
            oriArgs: params,
            toId: toId,
            capture: false,
        };

        that.win.parent.postMessage(JSON.stringify(data), '*');
    };

    IPC.prototype.notify = function (type, params, toId) {
        const iframeCollection = document.getElementsByTagName('iframe');
        const iframeList = Array.prototype.slice.call(iframeCollection);

        const dataStr = JSON.stringify({
            type: type,
            oriArgs: params,
            toId: toId,
            capture: true,
        });

        for (let i = 0, len = iframeList.length; i < len; i++) {
            const currentIframe = iframeList[i];

            currentIframe.contentWindow.postMessage(dataStr, '*');
        }
    };

    IPC.prototype.on = function (type, fn) {
        this.events[type] = this.events[type] || [];

        this.events[type].push(fn);
    };

    IPC.prototype._ready = function (id, win) {
        // 向上发送
        this.report(EVENT_NAME.ready, {
            id: id || this.id,
            href: (win && win.location.href) || this.href,
        });
    };

    IPC.prototype.sendTo = function (toId, type, params) {
        this._transfer(toId, type, params);
    };

    IPC.prototype.destory = function () {
        this.report(EVENT_NAME.destory, {
            id: this.id,
        });
    };

    IPC.uuid = function () {
        let s = [];
        let hexDigits = '0123456789abcdef';
        for (let i = 0; i < 36; i++) {
            s[i] = hexDigits[Math.floor(Math.random() * 0x10)];
        }

        s[14] = '4';
        s[19] = hexDigits[(s[19] & 0x3) | 0x8];
        s[8] = s[13] = s[18] = s[23] = '-';

        return s.join('');
    };

    IPC.EVENT_NAME = EVENT_NAME;

    return IPC;
});
