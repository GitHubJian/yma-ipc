# YMA IPC

基于 window.postMessage 完成的 IPC 通信

1. 实现了消息机制的缓存，防止 iframe 未初始化完成的消息丢失，自动实现 IPC 全局注册
2. 消息机制的广播，可以将消息发送给所有注册该消息的 iframe
3. 可以实现定向 iframe 进行通信
4. 内置了 `ready`、`destory`、`transfer` 事件

## Install

```sh
npm install yma-ipc
```

## Usage

```js
const IPC = require('yma-ipc');

const ipc = new IPC({
    id: '唯一ID',
    win: '当前 window 对象',
});

// 向上报告
ipc.report('Event Name', params);
// 向下通知
ipc.notify('Event Name', params);
// 注册消息
ipc.on('Event Name', function (params) {
    console.log(params);
});

// 定向发送消息
ipc.sendTo('id', 'Event Name', params);
```
