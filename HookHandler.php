<?php

class LocalTimeHookHandler
{
    private $host = DB_HOST;
    private $dbname = DB_NAME;
    private $user = DB_USER;
    private $password = DB_PASSWORD;
    private $charset = DB_CHARSET;
    private $db;
    private $numberOfAccounts = 6;
    private $defaultAccountName = 'introvert';
    private $allowedStorageTime = 3600*24*200;
    private $arrOfTables = [
        'ABC_3xx' => 'https://rossvyaz.ru/data/ABC-3xx.csv',
        'ABC_4xx' => 'https://rossvyaz.ru/data/ABC-4xx.csv',
        'ABC_8xx' => 'https://rossvyaz.ru/data/ABC-8xx.csv',
        'DEF_9xx' => 'https://rossvyaz.ru/data/DEF-9xx.csv',
    ];
    //range - максимально допустимая разница в кол-ве записей между csv файлом на россвязи и кол-вом записей, которое
    // было добавлено в нашу бд
    private $range = '100';
    private $arrOfCharsets = [
        'WINDOWS-1251'
    ];
    //при создании экземпляра класса подключаемся к базе
    public function __construct()
    {
        try {
            $this->db = new PDO('mysql:host=' . $this->host . ';dbname=' . $this->dbname.';charset='.$this->charset, $this->user, $this->password);
            $this->db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        } catch (Exception $e) {
            HU::log('Не удалось подключиться в БД: '.$e->getMessage());
            throw new Exception('Ошибка при подключении к БД: '.$e->getMessage());
        }
    }
    public function getDataAboutPhones($arrayOfNumbers)
    {
        if(!$this->db)
        {
            HU::log('Не удалось подключиться к БД');
            throw new Exception('Ошибка при подключении к БД');
        }
        $result = [];
        foreach ($arrayOfNumbers as $number)
        {
            $resArray = $this->getDataFromPhonesDBByPhoneNumber($number);
            if($resArray){
                $result[$number] = $resArray;
            } else {
                $result[$number] = false;
            }
        }
        return $result;
    }
    public function addToDb($data)
    {
        if(!$this->db)
        {
            HU::log('Не удалось подключиться к БД');
            throw new Exception('Ошибка при подключении к БД');
        }
        $data = $data['data'];
        foreach ($data as $item)
        {
            $region = $item['region'];
            $timezone = $item['timezone'];
            $this->addNumberToOurDB($region, $timezone);
        }
    }
    //метод для обновления БД с сайта Россвязи
    public function updatePhonesDB()
    {
        if(!$this->db)
        {
            HU::log('Не удалось подключиться к БД');
            throw new Exception('Ошибка при подключении к БД');
        }
        foreach ($this->arrOfTables as $tableName => $url){
            try {
                $file = fopen($url, 'r');
            } catch (Exception $e){
                HU::log('Не удалось получить доступ к файлу '.$url.'. '.$e->getMessage());
                continue;
            }
            $numberOfRecordsInCSV = count(file($url));
            if(!$numberOfRecordsInCSV){
                continue;
            }
            try {
                $this->db->beginTransaction();
                $truncateSQL = 'TRUNCATE TABLE '.$tableName;
                $preparedTruncRequest = $this->db->prepare($truncateSQL);
                $preparedTruncRequest->execute();
                while ($value = fgetcsv($file, 0, ';')){
                    $value[0] = (integer)$value[0];
                    $value[1] = (integer)$value[1];
                    $value[2] = (integer)$value[2];
                    $value[3] = (integer)$value[3];
                    /*
                     * todo
                     * если в массиве $arrOfCharsets будут обе кодировки и windows-1251, и iso-8859-1, то mb_detect_encoding
                     * будет всегда возвращать  iso-8859-1, но при перекодировании будет много случаев, когда будут вопросы
                     * вместо русского текста, если использовать только windows-1251, то появится много пустых строк
                     *
                     * */
                    $operatorCharset = mb_detect_encoding($value[5], $this->arrOfCharsets) ? mb_detect_encoding($value[5], $this->arrOfCharsets) : 'iso-8859-1';
                    $regionCharset = mb_detect_encoding($value[5], $this->arrOfCharsets) ? mb_detect_encoding($value[5], $this->arrOfCharsets) : 'iso-8859-1';
                    $value[4] = iconv($operatorCharset, 'UTF-8', $value[4]);
                    $value[5] = iconv($regionCharset, 'UTF-8', $value[5]);
                    $sql = 'INSERT INTO '.$tableName.' 
                (defcode, code_from, code_to, amount, operator, region)
                VALUES 
                (:defcode, :code_from, :code_to, :amount, :operator, :region)';
                    $preparedRequest = $this->db->prepare($sql);
                    $preparedRequest->execute([
                        ':defcode' => $value[0],
                        ':code_from' => $value[1],
                        ':code_to' => $value[2],
                        ':amount' => $value[3],
                        ':operator' => $value[4],
                        ':region' => $value[5]
                    ]);
                }
                $numberOfRecordsInDB = (int) $this->db->query("SELECT COUNT(*) as count FROM $tableName")->fetchColumn();
                if($numberOfRecordsInDB > $numberOfRecordsInCSV - $this->range){
                    HU::log('In CSV: '.$numberOfRecordsInCSV.'; In DB: '.$numberOfRecordsInDB.
                        '; Table '.$tableName.' has successfully updated');
                    $this->db->commit();
                } else {
                    HU::log('In CSV: '.$numberOfRecordsInCSV.'; In DB: '.$numberOfRecordsInDB.
                        '; Table '.$tableName.' has rollBacked');
                    $this->db->rollBack();
                }
            } catch (Exception $e) {
                HU::log('Ошибка при обновлении БД. '.$e->getMessage());
                $this->db->rollBack();
                continue;
            }
        }
    }
    public function getNextGeonameAccount($data)
    {
        $currentAccount = $data['account'];
        HU::log('Получаем новый аккаунт geoname');
        try {
            $account = $this->selectNextGeonameAccount($currentAccount);
            $result = $account ? $account : $this->defaultAccountName;
            HU::log('Новый аккаунт: '.$result);
            return ['account_name' => $result];
        } catch (Exception $e) {
            HU::log('Не удалось получить аккаунт из БД. Ошибка: '.$e->getMessage());
            return [
                'account_name' => $this->defaultAccountName
            ];
        }
    }
    // todo Подумать о переносе аккаунтов geoname из базы данных в файл-конфиг
    private function selectNextGeonameAccount($currentAccount)
    {
        if(!$this->db)
        {
            HU::log('Не удалось подключиться к БД');
            throw new Exception('Ошибка при подключении к БД');
        }
        $sqlSelectId = 'SELECT id FROM geoname_accounts WHERE account_name=:current_account';
        $preparedRequest = $this->db->prepare($sqlSelectId);
        $preparedRequest->execute([
            ':current_account' => $currentAccount
        ]);
        $currentAccountId = (int) $preparedRequest->fetchColumn();
        HU::log($currentAccountId);
        $nextAccountId = ($currentAccountId + 1) <= $this->numberOfAccounts ? ($currentAccountId + 1) : 1;
        // одним запросом  в таблице аккаунтов присваиваем новому статус 1, старому 0
        $sqlUpdate = 'INSERT INTO geoname_accounts 
            (id, status)
            VALUES 
            (:current_account_id, 0),
            (:next_account_id, 1)
            ON DUPLICATE KEY UPDATE 
            status=VALUES(status)';
        $preparedRequest = $this->db->prepare($sqlUpdate);
        $result = $preparedRequest->execute([
            ':current_account_id' => $currentAccountId,
            ':next_account_id' => $nextAccountId,
        ]);
        if(!$result){
            HU::log('Не удалось обновить статусы в табоице с аккаунтами');
            return false;
        }
        $sqlGetAccount = 'SELECT account_name FROM geoname_accounts WHERE id=:id';
        $preparedRequest = $this->db->prepare($sqlGetAccount);
        $preparedRequest->execute([
            ':id' => $nextAccountId
        ]);
        $accountName = $preparedRequest->fetchColumn();
        if(!$accountName){
            HU::log('Не удалось получить имя аккаунта');
            return false;
        }
        return $accountName;
    }
    private function getDataFromPhonesDBByPhoneNumber($number)
    {
        $data = $this->prepareMobileNumberForRequest($number);
        if(!$data)
        {
            HU::log('Номер '.$number.' имеет некорректный формат');
            return false;
        }

        $def = $data['def'];
        $lastPart = $data['lastPart'];
        $sql = 'SELECT * FROM '.$data['table'].' WHERE defcode='.$def.' AND code_from<='.$lastPart.' AND code_to>='.$lastPart;
        $preparedRequest = $this->db->prepare($sql);
        $preparedRequest->execute();
        $informationAboutNumber = $preparedRequest->fetch();

        if(!$informationAboutNumber){
            HU::log('Номер '.$number.' не найден в базах данных номеров');
            return false;
        }
        $region = $informationAboutNumber['region'];
        HU::log('Регион до парсинга '.$region);
        $regionNamePreparedForRequest = $this->prepareNameOfRegionForRequest($region);

        if(!$regionNamePreparedForRequest){
            HU::log('Некорректный регион');
            HU::loging(
                __DIR__ . '/logs_for_elems_without_timezone/regions_and_numbers_'.date("Ymd", time()).'.log',
                $number.' : '.$region.' - некорректный регион'
            );
            return false;
        }
        HU::log('Регион после парсинга '.$regionNamePreparedForRequest);


        $inOurDB = $this->searchRegionInOurDB($regionNamePreparedForRequest);
        if($inOurDB){
            if(!$inOurDB['needToUpdate']){
                HU::log('Регион '.$regionNamePreparedForRequest.' найден в нашей базе, часовой пояс '.$inOurDB['timezone']);
                $result = [
                    'timeZone' => $inOurDB['timezone'],
                    'region' => false,
                    'account' => false
                ];
                return $result;
            } else {
                HU::log('Регион '.$regionNamePreparedForRequest.' найден в нашей базе, время истекло, нужно обновить');
            }
        } else {
            HU::log('Регион '.$regionNamePreparedForRequest.' не найден в нашей базе');
        }

        $accountName = $this->getAccountName();
        if(!$accountName){
            $accountName = $this->defaultAccountName;
        };
        $result = [
            'timeZone' => false,
            'region' => $regionNamePreparedForRequest,
            'account' => $accountName
        ];
        return $result;
    }
    //Т.к есть ограничение на кол-во запросов с одного аккаунта, то нужно использовать несколько.
    //Данный метод возвращает имя аккаунта, для которого будет производиться запрос
    private function getAccountName()
    {
        try {
            $sqlSelectAccount = 'SELECT account_name FROM geoname_accounts WHERE status=1';
            $accountName =  $this->db->query($sqlSelectAccount)->fetchColumn();
            return $accountName ? $accountName : false;
        } catch (Exception $e) {
            HU::log('Не удалось получить имя аккаунта. Ошибка: '.$e->getMessage());
            return false;
        }
    }
    private function addNumberToOurDB($region, $timezone)
    {
        try {
            $currentTime = time();
            $sql = 'INSERT INTO intr_regions_db (region, time, timezone) VALUES (:region, :time, :timezone)
                ON DUPLICATE KEY UPDATE time=:time';
            HU::log($sql);
            $preparedRequest = $this->db->prepare($sql);
            $result = $preparedRequest->execute([
                ':region' => $region,
                ':time' => $currentTime,
                ':timezone' => $timezone
            ]);
            if($result){
                HU::log('Данные успешно записаны в БД');
            } else {
                HU::log('Не удалось записать данные в БД');
                HU::log($preparedRequest->errorInfo());
            }
        } catch (Exception $e) {
            HU::log('Не удалось записать данные в БД');
            HU::log($e->getMessage());
        }
    }
    //метод парсит названия региона в подходящий для запроса вид
    private function prepareNameOfRegionForRequest($region)
    {
        //названия регионов из БД, для которых есть несколько таймзон, для номеров из таких регионов
        // время не отрисовываем
        $patternsOfRegionsWithIncorrectTimezones = [
            '/Российская Федерация/',
            '/Дальневосточный федеральный округ/',
            '/Северо-Западный федеральный округ/',
            '/Сибирский федеральный округ/'
        ];

        foreach ($patternsOfRegionsWithIncorrectTimezones as $patern){
            if(preg_match($patern, $region)){
                return false;
            };
        }

        $patterns = [
            '/.*г\. +([а-яА-ЯёЁё]+ +[а-яА-ЯёЁё]{2,})/ui',
            '/.*г\. +([а-яА-ЯёЁё]+ *- *[а-яА-ЯёЁё]{2,})/ui',
            '/.*г\. +([а-яА-ЯёЁё]+)/ui',
            '/([а-яА-ЯёЁё]+ +край)/ui',
            '/([а-яА-ЯёЁё]+) +обл\./ui',
            '/([а-яА-ЯёЁё]+ +область)/ui',
            '/(республика +[а-яА-ЯёЁё]+ +[а-яА-ЯёЁё]+)/ui',
            '/(республика +[а-яА-ЯёЁё]+-[а-яА-ЯёЁё]+)/ui',
            '/(республика +[а-яА-ЯёЁё]+)/ui',
            '/([а-яА-ЯёЁё]+-[а-яА-ЯёЁё]+ +республика)/ui',
            '/([а-яА-ЯёЁё]+ +республика)/ui',
            '/р-ны +([а-яА-ЯёЁёйЙз]+)/ui',
            '/([а-яА-ЯёЁё]+)/ui',
        ];
        foreach ($patterns as $pattern){
            if(preg_match($pattern, $region, $arr)){
                return $arr[1];
            };
        }
        $patternsOfExceptions = [
            '/Центральный федеральный округ/' => 'Москва',
            '/Уральский федеральный округ/' => 'Челябинск'
        ];
        foreach ($patternsOfExceptions as $pattern => $replacement){
            if(preg_match($pattern, $region)){
                return $replacement;
            };
        }
        return $region;
    }
    private function searchRegionInOurDB($region)
    {
        $sql = 'SELECT * FROM intr_regions_db WHERE region=:region';
        $preparedRequest = $this->db->prepare($sql);
        $preparedRequest->execute([
            ':region' => $region
        ]);
        $result = $preparedRequest->fetch();
        if (!$result){
            return false;
        }
        $timeInDB = (int) $result['time'];
        $currentTime = time();
        if(($currentTime - $timeInDB) < $this->allowedStorageTime){
            return [
                'timezone' => $result['timezone'],
                'needToUpdate' => false
            ];
        } else {
            return [
                'timezone' => $result['timezone'],
                'needToUpdate' => true
            ];
        }
    }
    //метод для парсинга номера, для запроса в БД
    private function prepareMobileNumberForRequest($number)
    {
        HU::log('Номер до парсинга');
        HU::log($number);

        $pattern = '/^(8|\+7|7) *\({0,1} *\d{3} *\){0,1} *\d{3} *-* *\d{2} *-* *\d{2}$/';

        if (!preg_match($pattern, $number)){
            return false;
        } else {
            $number = preg_replace('/(^8|^\+7|^7| |-|\)|\()/', '', $number);
        }
        $def = substr($number, 0, 3);
        $lastPart = substr($number, 3);
        $table = $this->selectTableForNumber($def);
        if(!$table) {
            return false;
        }
        $result = [
            'def' => $def,
            'lastPart' => $lastPart,
            'number' => $number,
            'table' => $table
        ];
        HU::log('Данные после парсинга:');
        HU::log($result);
        return $result;
    }
    //метод по defcode возвращает имя таблицы, в которой нужно искать информацию
    private function selectTableForNumber($def)
    {
        $code = $def[0];
        switch ($code) {
            case '3': return 'ABC_3xx';
                break;

            case '4': return 'ABC_4xx';
                break;

            case '8': return 'ABC_8xx';
                break;

            case '9': return 'DEF_9xx';
                break;
            default: return false;
        }

    }
}