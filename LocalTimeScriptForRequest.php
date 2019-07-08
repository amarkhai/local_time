<?php
ini_set('error_log', __DIR__ . '/logs/php_errors_' . date("Ymd", time()) . '.log');
ini_set('log_errors', 1);

include_once(__DIR__ . '/../../_dev/_lib/init.php');
include_once(__DIR__ .'/../../_sys/system.php');
include_once(__DIR__ . '/HookHandler.php');
file_exists(__DIR__.'/intr_config.php') ? require(__DIR__.'/intr_config.php') : require(__DIR__.'/local_config.php');

header('Access-Control-Allow-Origin: *');

HU::logSetup(__DIR__ . '/logs/' . 'local_time_'.date("Ymd", time()).'.log');
HU::log('___________________start___________________');
if(!$_REQUEST['key']){
    HU::log('Не передан key');
    header('HTTP/1.0 403 Forbidden');
    return;
}
$url = parse_url($_SERVER['REQUEST_URI']);
parse_str($url['query'], $query);
$actionFromUrl = $query['action'];
HU::log('Action from url:');
HU::log($actionFromUrl);
HU::log('POST:');
HU::log($_POST);

$actionsArray = [
    'get_data_about_phones' => 'getDataAboutPhones',
    'add_to_db' => 'addToDb',
    'get_next_geoname_account' => 'getNextGeonameAccount'
];
if(!array_key_exists($actionFromUrl, $actionsArray)){
    HU::log('Некорректный запрос. Завершаем скрипт');
    HU::log('___________________end___________________');
} else {
    $action = $actionsArray[$actionFromUrl];
    HU::log('Action:');
    HU::log($action);
}
$data = $_POST;
try {
    $key = $_REQUEST['key'];
    $clid = key_GetClidByKey($key);
    $clientWidget = \Yadro\Models\ClientWidget::getClientWidget($clid, WIDGET_ID);
    if(!$clientWidget->params['frontend_status']){
        HU::log('Виджет у клиента clid='.$clid.' выключен');
        return;
    }

    $handler = new LocalTimeHookHandler();
    $result = $handler->$action($data);
} catch (Exception $e) {
    HU::log('Операция не выполнена. Ошибка: '.$e->getMessage());
    throw new Exception('Операция не выполнена. Ошибка: '.$e->getMessage());
}

HU::log('Ответ');
HU::log($result);
$response = json_encode($result);
echo $response;


HU::log('___________________end___________________');