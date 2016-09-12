'use strict';

exports.master = function (config, workers) {
    var cluster = require('cluster'),
        workers = [];

    if (config.verbose)
        config.logger.log('info', 'Master started on PID#' + process.pid + ', forking ' + config.workers + ' processes');

    var forkWorker = function(port)
    {
        var worker = cluster.fork({port: port});
        worker.port = port;
        if (typeof config.workerListener === 'function')
            worker.on('message', config.workerListener);
        workers.push(worker);
    };

    for (var iCounter = 0; iCounter < config.workers; iCounter++)
        forkWorker(config.worker_port + iCounter);

    setTimeout(function () {
        require('./http-proxy').init(config.workers, config.worker_port, config.proxy_port, config.session_hash, config.socket)
    }, config.delay);

    cluster.on('exit', function (worker, code, signal) {
        if (config.verbose)
            config.logger.log('info', 'Worker PID#' + worker.process.pid + ' died with code ' + code, config.respawn ? ', restarting' : '');

        if (workers.indexOf(worker) !== -1)
            workers.splice(workers.indexOf(worker), 1);

        if (config.respawn)
            forkWorker(worker.port);
    });

    return process.on('SIGQUIT', function () {
        if (config.verbose)
            config.logger.log('info', 'SIGQUIT received, will exit once all workers have finished current requests');

        config.respawn = false;

        var result = [];
        workers.forEach(function (worker) {
            result.push(worker.send('quit'));
        });
        return result;
    });
};

exports.worker = function (worker, callback) {
    var server = callback(worker, worker.process.env.port);
    if (!server)
        return;

    if (typeof server.on === 'function')
        server.on('close', function() {
            return process.exit();
        });

    if (typeof server.close === 'function')
        return process.on('message', function(msg) {
            if (msg === 'quit')
                return server.close();
        });
};