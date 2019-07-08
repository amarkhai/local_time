LocalTimeWidget = function() {
    let widget = this;
    this.code = null;
    this.key = '<?=$key?>';
    this.settings = {};
    this.urlForRequest = yadroFunctions.getBaseUrl() + '/yadrotrue/_widget/local_time/LocalTimeScriptForRequest.php';
    this.geonameURL = 'https://secure.geonames.org';
    this.objOfElemsWithPhones = {};
    this.arrayToAddInOurDB = [];
    this.counterOfStartedAjax = 0;
    this.counterOfFinishedAjax = 0;
    this.requestForNewAccount = false;
    this.currentMinutes;
    this.dataOverLimit = {
        account: '',
        data: []
    };
    //обьект для работы с local storage
    this.storageHandler = require('lib/common/fn').storeWithExpiration;
    const twig = require('twigjs');

    this.addToStorage = function (storage, data) {
        let currentData = widget.storageHandler.get(storage);
        if(currentData){
            let obj = Object.assign(currentData, data);
            widget.storageHandler.set(storage, obj, 86400000);
        } else {
            widget.storageHandler.set(storage, data, 86400000);
        }
    };
    //функция, которая проверяет введенные значения начала и конца рабочего времени, перед тем, как добавить их в настройки виджета
    this.checkDataBeforeSave = function (start, end) {
        const startArr = start.match(/^(\d\d):(\d\d)$/);
        const endArr = end.match(/^(\d\d):(\d\d)$/);
        if (!startArr || !endArr){
            return false;
        } else {
            if (startArr[1] > 23 || endArr > 23 || startArr[2] > 59 || endArr[2] > 59){
                return false;
            } else {
                if (startArr[1] >= endArr[1]){
                    if (startArr[1] > endArr[1]){
                        return false;
                    } else {
                        if (startArr[2] >= endArr[2]){
                            return false;
                        } else {
                            return true;
                        }
                    }
                } else {
                    return true;
                }
            }
        }
    };
    //функция для рендера одного номера. Вызвается при добавлении или изменении телефона
    this.renderTimeSinglePhone = function (timezone, elementForRender) {
        const localTimeTwig = `/intr/${widget.code}/localTime.twig`;
        const currentDate = new Date();

        let hours = currentDate.getUTCHours() + parseInt(timezone);
        if(hours > 23){
           hours = hours - 24;
        }
        if(hours < 10){
           hours = '0' + hours;
        }
        let minutes;
        if(widget.currentMinutes){
            minutes = widget.currentMinutes;
        } else {
            minutes = currentDate.getUTCMinutes();
            if(minutes < 10){
                minutes = '0' + minutes;
            }
        }
        let timeViewClass = widget.getClassForTime(hours, minutes);
        yadroFunctions.render(localTimeTwig, {
           hours: hours,
           minutes: minutes,
           timeViewClass: timeViewClass
        }, (html)=>{
               elementForRender.find('.widget_local_time_time').remove();
               elementForRender.find('div.linked-form__field__value').append(html);
        });
    };
    //функция для отрисовки времени для всех номеров на странице. Вызывается при рендере странице и далее раз в минуту,
    //чтобы отрисовывать актуальное время
    this.renderTimeForAllPhones = function () {
        const elementsForRender = widget.objOfElemsWithPhones;
        const localTimeTwig = `/intr/${widget.code}/localTime.twig`;
        const storage = widget.storageHandler.get('intr_local_time');
        for (let key in elementsForRender){
            if(!storage || !storage[key] || storage[key] === 'false'){
                continue;
            }
            for(let i = 0; i < elementsForRender[key].length; i++){
                let phone = elementsForRender[key][i].find('input.control--suggest--input').val();
                if(phone != key){
                    elementsForRender[key].splice(i, 1);
                    --i;
                }
            }
            const currentDate = new Date();
            let hours = currentDate.getUTCHours() + parseInt(storage[key]);
            if(hours > 23){
                hours = hours - 24;
            }
            if(hours < 10){
                hours = '0' + hours;
            }
            let minutes = currentDate.getUTCMinutes();
            if(minutes < 10){
                minutes = '0' + minutes;
            }
            let timeViewClass = widget.getClassForTime(hours, minutes);
            widget.currentMinutes = minutes;
            yadroFunctions.render(localTimeTwig, {
                hours: hours,
                minutes: minutes,
                timeViewClass: timeViewClass
            }, (html)=>{
                for(let i = 0; i < elementsForRender[key].length; i++){
                    elementsForRender[key][i].find('.widget_local_time_time').remove();
                    elementsForRender[key][i].append(html);
                }
            });
        }
    };
    //функция , которая возвращает нужный класс для элемента с временем
    this.getClassForTime = function (hours, minutes) {
        const settings = yadroFunctions.getSettings(widget.code);
        const timeEnd = settings.timeEnd;
        const timeStart = settings.timeStart;
        const arrayOfStartTime = timeStart.split(':');
        const arrayOfEndTime = timeEnd.split(':');
        const workingTimeClass = 'widget_local_time_working_time';
        const notWorkingTimeClass = 'widget_local_time_not_working_time';
        const workingTimeClassWithTimeInAmo = 'widget_local_time_working_time_amo';
        const amoTimezone = AMOCRM.system.timezone;
        const options = {
            timeZone: amoTimezone,
            hour: 'numeric',
            hour12: false
        };
        const hourInAmo = new Intl.DateTimeFormat([], options).format(new Date());

        if (hours > arrayOfStartTime[0] && hours < arrayOfEndTime[0]){
            if(hours == hourInAmo){
                return workingTimeClassWithTimeInAmo;
            } else {
                return workingTimeClass;
            }
        } else {
            if (hours == arrayOfStartTime[0] || hours == arrayOfEndTime[0]){
                if ((hours == arrayOfStartTime[0] && minutes >= arrayOfStartTime[1]) || (hours == arrayOfEndTime[0] && minutes < arrayOfEndTime[1])){
                    if(hours == hourInAmo){
                        return workingTimeClassWithTimeInAmo;
                    } else {
                        return workingTimeClass;
                    }
                } else {
                    return notWorkingTimeClass;
                }
            } else {
                return notWorkingTimeClass;
            }
        }
    };
    //функция, которая делает кнопку "Сохранить" активной/неактивной в зависимости от корректности выбранных настроек
    this.changeSaveButtonInSettings = function(active){
        const button = $('.widget_local_time_settings').parents('.widget_settings_block').find('.button-input.button-input_blue');
        if(active){
            button.trigger('button:enable');
        } else {
            button.trigger('button:disable');
        }
    };
    //при добавлении нового номера, амо копирует/вставляет предыдущий элемент с номером(весь, кроме номера). Поэтому,
    //если в предыдущем элементе с номером было отрисано местное время, то оно также будет скопировано и нарисовано.
    //Эта функция отслеживает с помощью mutationObserver добавление нового элемента для номера и убирает время
    this.addMutationObserverForAddNumber = function (elem) {
        const observer = new MutationObserver((mutations)=>{
            mutations.forEach((mutation)=>{
                if (mutation.addedNodes && mutation.addedNodes[0] && mutation.addedNodes[0].classList.contains('linked-form__field')){
                    if(mutation.addedNodes[0].querySelector('.widget_local_time_time')){
                        mutation.addedNodes[0].querySelector('.widget_local_time_time').remove();
                        observer.disconnect();
                        return;
                    }

                }
            })
        });
        const config = {childList: true};
        observer.observe(elem, config);
    };
    //Обработчик для данных, которые не удалось отправить на geoname из-за лимита на кол-во запросов
    this.handlerOverLimit = function () {
        if(!widget.dataOverLimit.account || !widget.dataOverLimit.data.length){
            return;
        }
        widget.requestForNewAccount = true;
        let currentAccount = widget.dataOverLimit.account;
        $.ajax({
            url: widget.urlForRequest + '?action=get_next_geoname_account&key=' + widget.key,
            method: 'post',
            data: {
                account: currentAccount
            },
            success: (data) => {
                let account = JSON.parse(data)['account_name'];
                let elems = widget.dataOverLimit.data;
                widget.counterOfStartedAjax = elems.length;
                for(let i = 0; i < elems.length; i++){
                    widget.requestToGeoname(elems[i].region, account, elems[i].number, elems[i].elem);
                }
                widget.dataOverLimit.data = [];
                widget.dataOverLimit.account = '';
            }
        });

    };
    //функция , которая делает запрос на сайт geoname. Данный функционал не удалось нормально реализовать на бэке, т.к
    // в geoname , по всей видимости, стоит ограничение по запросам с одного IP
    // ограничения для одного аккаунта для запросов /search - 20 000 в день, 1 000 в час
    this.requestToGeoname = function (region, account, number, elem) {
        const urlForGeonameId = widget.geonameURL + '/search';
        $.ajax({
            url: urlForGeonameId,
            method: 'get',
            data: {
                q: region,
                maxRows: 1,
                type: 'json',
                style: 'full',
                username: account
            },
            success: (data)=>{

                if(data.status){
                    yadroFunctions.log(data.message);
                    if(data.status.value == 19 || data.status.value == 20) {
                        widget.dataOverLimit.account = account;
                        widget.dataOverLimit.data.push({
                            region: region,
                            number: number,
                            elem: elem
                        });
                        return;
                    }
                }
                let timezone;
                if(data.totalResultsCount){
                    if(data.geonames[0] && data.geonames[0].timezone){
                        timezone = data.geonames[0].timezone.dstOffset;
                        if(timezone){
                            widget.addToStorage('intr_local_time', {[number]: timezone});
                            widget.arrayToAddInOurDB.push({
                                region: region,
                                timezone: timezone
                            });
                        } else {
                            widget.objOfElemsWithPhones[number] = false;
                        }
                    } else {
                        widget.addToStorage('intr_local_time', {[number]: false});
                    }
                } else {
                    widget.addToStorage('intr_local_time', {[number]: false});
                }
                if (elem && timezone){
                    widget.renderTimeSinglePhone(timezone, elem);
                    widget.addDataToOurDB();
                }
            },
            error: (x, s, e) => {
                widget.counterOfFinishedAjax++;
                yadroFunctions.log(e);
            }
        });
    };
    //функция, которая отслеживает, все ли были сделаны ajax-запросы на geoname, или нет, и запускает функцию для рендера,
    //после того, как все данные получены
    this.ajaxCompleteHandler = function (event, xhr, ajaxOptions){
        if(ajaxOptions.url.indexOf(widget.geonameURL) === 0){
            widget.counterOfFinishedAjax++;
            if(widget.counterOfStartedAjax === widget.counterOfFinishedAjax){
                widget.counterOfStartedAjax = 0;
                widget.counterOfFinishedAjax = 0;
                if(widget.dataOverLimit.data.length && !widget.requestForNewAccount) {
                    widget.handlerOverLimit();
                    return;
                }
                $(document).off('ajaxComplete', document, widget.ajaxCompleteHandler);
                widget.renderTimeForAllPhones();
                widget.addDataToOurDB();
                if(widget.requestForNewAccount){
                    yadroFunctions.log('У аккаунтов достигнут лимит запросов');
                }
            }
        }
    };
    //функция, которая запускает отслеживание ajax запросов
    this.switchOnWatchingAjax = function () {
        $(document).ajaxComplete(widget.ajaxCompleteHandler);
    };
    //функция для добавления данных о номерах и таймзонах в нашу БД
    this.addDataToOurDB = function () {
        if(!widget.arrayToAddInOurDB.length){
            return;
        }
        $.ajax({
            url: widget.urlForRequest + '?action=add_to_db&key=' + widget.key,
            method: 'post',
            data: {
                data: widget.arrayToAddInOurDB
            },
            success: (data)=>{
                widget.arrayToAddInOurDB = [];
                yadroFunctions.log(data);
            },
            error: (x, s, e)=>{
                yadroFunctions.log(e);
            }
        });
    };
    //функция для запросов на наш скрипт на бэке. Который ищет, есть ли регион по такому номеру в нашей БД. Если да - возвращает таймзону,
    //если нет - парсит название региона,выбирает актуальный аккаунт для запроса на geoname и возвращает эти значения
    this.requestForTimezone = function(requestData, elemForRender = null){
        $.ajax({
            url: widget.urlForRequest + '?action=get_data_about_phones&key=' + widget.key,
            method: 'post',
            data: requestData,
            success: (data)=>{
                yadroFunctions.log(data);
                let watchingForAjax = false;
                const objectOfTimezones = JSON.parse(data);
                if (elemForRender){
                    let number = requestData[1];
                    if(!objectOfTimezones[number]){
                        if(objectOfTimezones[number] === false){
                            widget.addToStorage('intr_local_time', {[number]: false});
                        }
                        return;
                    }
                    if(!widget.objOfElemsWithPhones[number]){
                        widget.objOfElemsWithPhones[number] = [elemForRender];
                    } else {
                        widget.objOfElemsWithPhones[number].push(elemForRender);
                    }
                    if(!objectOfTimezones[number].timeZone){
                        let region = objectOfTimezones[number].region;
                        let account = objectOfTimezones[number].account;
                        widget.requestToGeoname(region, account, number, elemForRender);
                    } else {
                        let timezone = objectOfTimezones[number].timeZone;
                        widget.addToStorage('intr_local_time', {[number]: timezone});
                        widget.renderTimeSinglePhone(timezone, elemForRender);
                    }
                    return;
                }
                for(let key in requestData){
                    if (objectOfTimezones[requestData[key]] === false){
                        widget.addToStorage('intr_local_time', {[requestData[key]]: false});
                    }
                    if (objectOfTimezones[requestData[key]]){
                        if(objectOfTimezones[requestData[key]].timeZone){
                            widget.addToStorage('intr_local_time', {[requestData[key]]: objectOfTimezones[requestData[key]].timeZone});
                        } else {
                            if(!watchingForAjax){
                                widget.switchOnWatchingAjax();
                            }
                            watchingForAjax = true;
                            widget.counterOfStartedAjax++;
                            let region = objectOfTimezones[requestData[key]].region;
                            let account = objectOfTimezones[requestData[key]].account;
                            let number = requestData[key];
                            widget.requestToGeoname(region, account, number, elemForRender);
                        }
                    }
                }
                if(!watchingForAjax){
                    widget.renderTimeForAllPhones();
                }
            },
            error: (x, s, e)=>{
                yadroFunctions.log(e);
                widget.openErrorModal();
            }
        });
    };
    this.openErrorModal = () => {
        const Modal = require('lib/components/base/modal');
        new Modal({
            class_name: 'local_time_error_modal',
            init: function ($modal_body) {
                yadroFunctions.render(
                    `/intr/${widget.code}/localTimeErrorModalBody.twig`,
                    {},
                    (html)=>{
                        $modal_body
                            .trigger('modal:loaded')
                            .html(html)
                            .trigger('modal:centrify')
                            .append('<span class="modal-body__close"><span class="icon icon-modal-close"></span></span>');
                    }
                );
            }
        });
    };

    //обрабочик на изменение номера
    this.bind_actions = function(){
        $(document).on(
            'change',
            '.control-phone__formatted.js-form-changes-skip.linked-form__cf.js-linked-pei.text-input',
            function(e){
                const storage = widget.storageHandler.get('intr_local_time');
                $(e.currentTarget).parents('.linked-form__field.linked-form__field-pei').find('.widget_local_time_time').remove();
                if(!e.currentTarget.value){
                    return;
                }
                let number = $(e.currentTarget).parent().find('input.control--suggest--input').val();
                let elem = $(e.currentTarget).parents('.linked-form__field.linked-form__field-pei');
                if(storage && storage[number]){
                    let timezone = storage[number];
                    if(timezone !== 'false'){
                        widget.renderTimeSinglePhone(timezone, elem);
                    }
                    return;
                }
                widget.requestForTimezone({ 1: number}, elem);
            })
    };

    this.render = function() {
        widget.objOfElemsWithPhones = {};
        const storage = widget.storageHandler.get('intr_local_time');
        const arrOfInputs = $('.js-control-phone.control-phone input.control--suggest--input');
        let needToRequest = false;
        let requestData = {};
        let needToRender = false;

        for (let i = 0; i < arrOfInputs.length; i++){

            if (arrOfInputs[i].value){
                let phone = arrOfInputs[i].value;
                if(!storage || !storage[phone]){
                    needToRequest = true;
                    requestData[i] = phone;
                }
                let elem = $(arrOfInputs[i]).parents('.linked-form__field.linked-form__field-pei');
                if(widget.objOfElemsWithPhones[phone]){
                    widget.objOfElemsWithPhones[phone].push(elem);
                } else {
                    widget.objOfElemsWithPhones[phone] = [elem];
                }
                let elemForAddNumber = $(arrOfInputs[i]).parents('.linked-form__multiple-container');
                widget.addMutationObserverForAddNumber(elemForAddNumber[0]);
                needToRender = true;
            }
        }
        if (needToRequest){
            widget.requestForTimezone(requestData);
        } else {
            if(needToRender){
                widget.renderTimeForAllPhones();
            }
        }
        widget.timerId = setInterval(widget.renderTimeForAllPhones, 60000);
    };

    this.init = function(){
        let baseUrl = yadroFunctions.getBaseUrl();
        yadroFunctions.addTwig(widget.code, {
            localTime: `${baseUrl}/yadrotrue/_widget/${widget.code}/templates/local_time.twig`,
            localTimeTimeInput: `${baseUrl}/yadrotrue/_widget/${widget.code}/templates/local_time_time_input.twig`,
            localTimeSettings: `${baseUrl}/yadrotrue/_widget/${widget.code}/templates/local_time_settings.twig`,
            localTimeErrorModalBody: `${baseUrl}/yadrotrue/_widget/${widget.code}/templates/local_time_error_modal_body.twig`,
        });
        $('head').append(
            $(`<link type="text/css" rel="stylesheet" href="${baseUrl}/yadrotrue/_widget/${widget.code}/css/style.css?v=1.01" type="text/css" media="screen">`)
        );
    };

    this.renderConfig = function() {
        const settings = yadroFunctions.getSettings(widget.code);
        const localTimeSettingsTwig = `/intr/${widget.code}/localTimeSettings.twig`;
        yadroFunctions.render(localTimeSettingsTwig, {
            timeStart: settings.timeStart ? settings.timeStart : '09:00',
            timeEnd: settings.timeEnd ? settings.timeEnd : '19:00'
        }, (html)=>{
            $('div.widget_settings_block__fields').append(html);
            $('.widget_local_time_ul li').on('click', (e)=>{
                let start = [];
                let end = [];
                if($(e.currentTarget).parents('.widget_local_time_start_time_block').length){
                    start = e.currentTarget.dataset.valueId.split(':');
                    end = $('#widget_local_time_end_time_input').val().split(':');
                } else {
                    start = $('#widget_local_time_start_time_input').val().split(':');
                    end = e.currentTarget.dataset.valueId.split(':');
                }
                if (start[0] >= end[0]){
                    if(start[0] > end[0]){
                        widget.changeSaveButtonInSettings(false);
                    } else {
                        if(start[1] >= end[1]){
                            widget.changeSaveButtonInSettings(false);
                        } else {
                            widget.changeSaveButtonInSettings(true);
                        }
                    }
                } else {
                    widget.changeSaveButtonInSettings(true);
                }
            });
        });
    };
    this.saveConfig = function(){
        const timeStart = $('#widget_local_time_start_time_input').val() ? $('#widget_local_time_start_time_input').val() : '09:00';
        const timeEnd = $('#widget_local_time_end_time_input').val() ? $('#widget_local_time_end_time_input').val() : '19:00';

        if(widget.checkDataBeforeSave(timeStart, timeEnd)){
            yadroFunctions.setSettings(widget.code, {
                timeStart: timeStart,
                timeEnd: timeEnd
            })
        }
    };
    this.bootstrap = function(code) {
        widget.code = code;
        widget.init();
        // если frontend_status не задан, то считаем что виджет выключен
        let status = yadroFunctions.getSettings(code).frontend_status;

        if (status) {
            widget.bind_actions();
            widget.render();
            $(document).on('widgets:load', function () {
                widget.render();
            });
        }
    }
};
yadroWidget.widgets['local_time'] = new LocalTimeWidget();
yadroWidget.widgets['local_time'].bootstrap('local_time');