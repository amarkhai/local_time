<?php
ini_set('error_log', __DIR__ . '/logs/updateDB_errors_' . date("Ymd", time()) . '.log');
ini_set('log_errors', 1);
include_once(__DIR__ . '/../../_dev/_lib/init.php');
include_once(__DIR__ . '/HookHandler.php');

HU::logSetup(__DIR__ . '/logs/' . 'local_time_updateDB_'.date("Ymd", time()).'.log');
HU::log('___________________start___________________');
try {
    $handler = new LocalTimeHookHandler();
    $handler->updatePhonesDB();
} catch (Exception $e){
    HU::log('Не удалось обновить БД. Ошибка: '.$e->getMessage());
    throw new Exception('Не удалось обновить БД. Ошибка:'.$e->getMessage());
}
HU::log('___________________END___________________');