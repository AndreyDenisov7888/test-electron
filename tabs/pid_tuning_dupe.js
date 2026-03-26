'use strict';

import MSPChainerClass from '../js/msp/MSPchainer';
import mspHelper from '../js/msp/MSPHelper';
import MSPCodes from '../js/msp/MSPCodes';
import MSP from '../js/msp';
import { GUI, TABS } from '../js/gui';
import tabs from '../js/tabs';
import FC from '../js/fc';
import Settings from '../js/settings';
import i18n from '../js/localization';
import { scaleRangeInt } from '../js/helpers';
import interval from '../js/intervals';
import dialog from '../js/dialog';
import * as d3 from 'd3';
import CONFIGURATOR from './../js/data_storage';
import BitHelper from './../js/bitHelper';  
import store from '../js/store';

import { titleize } from  'inflection';
import semver from 'semver';
import mapSeries from 'promise-map-series';
import jBox from 'jbox';
import { debounce } from 'throttle-debounce';
import { globalSettings } from '../js/globalSettings';
import { PortHandler } from '../js/port_handler';

import OSD, { FONT, HARDWARE } from '../tabs/osd_dupe';


HARDWARE.update = function(callback) {
    HARDWARE.init();
    MSP.send_message(MSPCodes.MSP2_CF_SERIAL_CONFIG, false, false, function() {
        $.each(FC.SERIAL_CONFIG.ports, function(index, port){
            if(port.functions.includes('DJI_FPV')) {
                HARDWARE.capabilities.isDjiHdFpv = true;
            }
            if(port.functions.includes('MSP_DISPLAYPORT')) {
                HARDWARE.capabilities.isMspDisplay = true;
            }
            if (port.functions.includes('ESC')) {
                HARDWARE.capabilities.useESCTelemetry = true;
            }
        });
        mspHelper.loadRxConfig(function() {
            HARDWARE.capabilities.useCRSF = (FC.RX_CONFIG.serialrx_provider == 6);
            HARDWARE.capabilities.useRx = (FC.RX_CONFIG.serialrx_provider == 6 || FC.RX_CONFIG.receiver_type == 2 || FC.RX_CONFIG.serialrx_provider == 12);
            mspHelper.loadSensorConfig(function () {
                HARDWARE.capabilities.useBaro  = (FC.SENSOR_CONFIG.barometer != 0);
                HARDWARE.capabilities.usePitot = (FC.SENSOR_CONFIG.pitot != 0);
                if (callback) callback();
            });
        });
    });
};

TABS.pid_tuning_dupe = {
    rateChartHeight: 117
};

TABS.pid_tuning_dupe.initialize = function (callback) {

    var loadChainer = new MSPChainerClass();

    let EZ_TUNE_PID_RP_DEFAULT = [40, 75, 23, 100];
    let EZ_TUNE_PID_YAW_DEFAULT = [45, 80, 0, 100];

    var loadChain = [
        mspHelper.loadPidData,
        mspHelper.loadRateDynamics,
        mspHelper.loadRateProfileData,
        mspHelper.loadEzTune,
        mspHelper.loadMixerConfig,
    ];

    loadChainer.setChain(loadChain);
    loadChainer.setExitPoint(load_html);
    loadChainer.execute();

    if (GUI.active_tab != 'pid_tuning_dupe') {
        GUI.active_tab = 'pid_tuning_dupe';
    }


    function load_html() {

    import('./sensors_dupe.html?raw').then(({default: sensorsHtml}) => {
        

        import('./pid_tuning_dupe.html?raw').then(({default: pidStructHtml}) => {
            

            import('./osd_dupe.html?raw').then(({default: osdHtml}) => {
                
                const combinedHtml = `
                <div class="tab-pid_tuning_dupe toolbar_fixed_bottom">
                    <div id="tuning-wrapper" class="content_wrapper">
                        
                        <!-- Заголовки подвкладок -->
                        <div class="tab_title subtab__header">
                            
                            <!-- ✅ OSD: активный (добавлен класс --current) -->
                            <span class="subtab__header_label subtab__header_label--current" 
                                for="subtab-filters" 
                                data-i18n="tabOSD"></span>

                            <!-- Sensors: неактивный (убран класс --current) -->
                            <span class="subtab__header_label" 
                                for="subtab-pid_dupe" 
                                data-i18n="tabRawSensorData"></span>
                        </div>

                        <!-- ✅ Контент: OSD (активен, добавлен класс --current) -->
                        <div id="subtab-filters" class="subtab__content subtab__content--current">
                            ${osdHtml}
                        </div>

                         <!-- Контент: Sensors (скрыт, убран класс --current) -->
                        <div id="subtab-pid_dupe" class="subtab__content">
                            ${sensorsHtml}
                        </div>

                    </div>
                </div>
                `;
                
                
                GUI.load(combinedHtml, Settings.processHtml(process_html));
                
            }); 
        }); 
    }); 
}

    function drawExpoCanvas(value, $element, color, width, height, clear) {
         if (!$element || typeof $element.getContext !== 'function') {
            return;  
        }   
        
        let context = $element.getContext("2d");

        if (value < 0 || value > 1) {
            return;
        }

        if (clear === true) {
            context.clearRect(0, 0, width, height);
        }

        context.beginPath();
        context.moveTo(0, height);
        context.quadraticCurveTo(width / 2, height - ((height / 2) * (1 - value)), width, 0);
        context.lineWidth = 2;
        context.strokeStyle = color;
        context.stroke();

    };

    function drawRollPitchYawExpo() {
        

        
        let pitch_roll_curve = $('.pitch_roll_curve canvas').get(0);
        let manual_expo_curve = $('.manual_expo_curve canvas').get(0);

        drawExpoCanvas(
            parseFloat($('#rate_rollpitch_expo').val()) / 100,
            pitch_roll_curve,
            '#a00000',
            200,
            TABS.pid_tuning_dupe.rateChartHeight,
            true
        );
        drawExpoCanvas(
            parseFloat($('#rate_yaw_expo').val()) / 100,
            pitch_roll_curve,
            '#00a000',
            200,
            TABS.pid_tuning_dupe.rateChartHeight,
            false
        );

        drawExpoCanvas(
            parseFloat($('#manual_rollpitch_expo').val()) / 100,
            manual_expo_curve,
            '#a00000',
            200,
            TABS.pid_tuning_dupe.rateChartHeight,
            true
        );

        drawExpoCanvas(
            parseFloat($('#manual_yaw_expo').val()) / 100,
            manual_expo_curve,
            '#00a000',
            200,
            TABS.pid_tuning_dupe.rateChartHeight,
            false
        );

        drawExpoCanvas(
            Math.floor(scaleRange($('#ez_tune_expo').val(), 0, 200, 40, 100)) / 100,
            $('#ez_tune_expo_curve canvas').get(0),
            '#a00000',
            250,
            200,
            true
        );
    }

    function pid_and_rc_to_form() {

        // Fill in the data from FC.PIDs array
        var pidNames = FC.getPidNames();

        $('[data-pid-bank-position]').each(function () {
            var $this = $(this),
                bankPosition = $this.data('pid-bank-position');

            if (pidNames[bankPosition]) {
                $this.find('td:first').text(pidNames[bankPosition]);

                $this.find('input').each(function (index) {
                $(this).val(FC.PIDs[bankPosition][index]);
                });
            }
        });

        $('#tpa').val(FC.RC_tuning.dynamic_THR_PID);
        $('#tpa-breakpoint').val(FC.RC_tuning.dynamic_THR_breakpoint);
    }

    function form_to_pid_and_rc() {

        $('[data-pid-bank-position]').each(function () {
            
            var $this = $(this),
                bankPosition = $this.data('pid-bank-position');

            if ($this.hasClass('is-hidden')) {
                return;
            }

            if (FC.PIDs[bankPosition]) {
                $this.find('input').each(function (index) {
                    FC.PIDs[bankPosition][index] = parseFloat($(this).val());
                });
            }
        });

        // catch RC_tuning changes
        FC.RC_tuning.roll_rate = parseFloat($('#rate_roll_rate').val());
        FC.RC_tuning.pitch_rate = parseFloat($('#rate_pitch_rate').val());
        FC.RC_tuning.yaw_rate = parseFloat($('#rate_yaw_rate').val());

        FC.RC_tuning.RC_EXPO = parseFloat($('#rate_rollpitch_expo').val()) / 100;
        FC.RC_tuning.RC_YAW_EXPO = parseFloat($('#rate_yaw_expo').val()) / 100;

        FC.RC_tuning.dynamic_THR_PID = parseInt($('#tpaRate').val());
        FC.RC_tuning.dynamic_THR_breakpoint = parseInt($('#tpaBreakpoint').val());

        FC.RC_tuning.manual_roll_rate = $('#rate_manual_roll').val();
        FC.RC_tuning.manual_pitch_rate = $('#rate_manual_pitch').val();
        FC.RC_tuning.manual_yaw_rate = $('#rate_manual_yaw').val();

        FC.RC_tuning.manual_RC_EXPO = $('#manual_rollpitch_expo').val() / 100;
        FC.RC_tuning.manual_RC_YAW_EXPO = $('#manual_yaw_expo').val() / 100;

        // Rate Dynamics
        FC.RATE_DYNAMICS.sensitivityCenter = parseInt($('#rate_dynamics_center_sensitivity').val());
        FC.RATE_DYNAMICS.sensitivityEnd = parseInt($('#rate_dynamics_end_sensitivity').val());
        FC.RATE_DYNAMICS.correctionCenter = parseInt($('#rate_dynamics_center_correction').val());
        FC.RATE_DYNAMICS.correctionEnd = parseInt($('#rate_dynamics_end_correction').val());
        FC.RATE_DYNAMICS.weightCenter = parseInt($('#rate_dynamics_center_weight').val());
        FC.RATE_DYNAMICS.weightEnd = parseInt($('#rate_dynamics_end_weight').val());

    }
    
    function getYawPidScale(input) {
        const normalized = (input - 100) * 0.01;
    
        return 1.0 + (normalized * 0.5); 
    }

    function scaleRange(x, srcMin, srcMax, destMin, destMax) {
        let a = (destMax - destMin) * (x - srcMin);
        let b = srcMax - srcMin;
        return ((a / b) + destMin);
    }

    function updatePreview() {

        let axisRatio = $('#ez_tune_axis_ratio').val() / 100;
        let response = $('#ez_tune_response').val();
        let damping = $('#ez_tune_damping').val();
        let stability = $('#ez_tune_stability').val();
        let aggressiveness = $('#ez_tune_aggressiveness').val();
        let rate = $('#ez_tune_rate').val();
        let expo = $('#ez_tune_expo').val();

        $('#preview-roll-p').html(Math.floor(EZ_TUNE_PID_RP_DEFAULT[0] * response / 100));
        $('#preview-roll-i').html(Math.floor(EZ_TUNE_PID_RP_DEFAULT[1] * stability / 100));
        $('#preview-roll-d').html(Math.floor(EZ_TUNE_PID_RP_DEFAULT[2] * damping / 100));
        $('#preview-roll-ff').html(Math.floor(EZ_TUNE_PID_RP_DEFAULT[3] * aggressiveness / 100));

        $('#preview-pitch-p').html(Math.floor(axisRatio * EZ_TUNE_PID_RP_DEFAULT[0] * response / 100));
        $('#preview-pitch-i').html(Math.floor(axisRatio * EZ_TUNE_PID_RP_DEFAULT[1] * stability / 100));
        $('#preview-pitch-d').html(Math.floor(axisRatio * EZ_TUNE_PID_RP_DEFAULT[2] * damping / 100));
        $('#preview-pitch-ff').html(Math.floor(axisRatio * EZ_TUNE_PID_RP_DEFAULT[3] * aggressiveness / 100));

        $('#preview-yaw-p').html(Math.floor(EZ_TUNE_PID_YAW_DEFAULT[0] * getYawPidScale(response)));
        $('#preview-yaw-i').html(Math.floor(EZ_TUNE_PID_YAW_DEFAULT[1] * getYawPidScale(stability)));
        $('#preview-yaw-d').html(Math.floor(EZ_TUNE_PID_YAW_DEFAULT[2] * getYawPidScale(damping)));
        $('#preview-yaw-ff').html(Math.floor(EZ_TUNE_PID_YAW_DEFAULT[3] * getYawPidScale(aggressiveness)));

        $('#preview-roll-rate').html(Math.floor(scaleRange(rate, 0, 200, 30, 90)) * 10 + " dps");
        $('#preview-pitch-rate').html(Math.floor(scaleRange(rate, 0, 200, 30, 90)) * 10 + " dps");
        $('#preview-yaw-rate').html((Math.floor(scaleRange(rate, 0, 200, 30, 90)) - 10) * 10 + " dps");

        $('#preview-roll-expo').html(Math.floor(scaleRange(expo, 0, 200, 40, 100)) + "%");
        $('#preview-pitch-expo').html(Math.floor(scaleRange(expo, 0, 200, 40, 100)) + "%");
        $('#preview-yaw-expo').html(Math.floor(scaleRange(expo, 0, 200, 40, 100)) + "%");

    }

    function initSensorsTab() {


    console.log('Sensors tab: initializing...');

    function initSensorData(){
        for (var i = 0; i < 3; i++) {
            FC.SENSOR_DATA.accelerometer[i] = 0;
            FC.SENSOR_DATA.gyroscope[i] = 0;
            FC.SENSOR_DATA.magnetometer[i] = 0;
            FC.SENSOR_DATA.sonar = 0;
            FC.SENSOR_DATA.air_speed = 0;
            FC.SENSOR_DATA.altitude = 0;
            FC.SENSOR_DATA.temperature[i] = 0;
            FC.SENSOR_DATA.debug[i] = 0;
        }
    }

    function initDataArray(length) {
        var data = new Array(length);
        for (var i = 0; i < length; i++) {
            data[i] = new Array();
            data[i].min = -1;
            data[i].max = 1;
        }
        return data;
    }

    function addSampleToData(data, sampleNumber, sensorData) {
        for (var i = 0; i < data.length; i++) {
            var dataPoint = sensorData[i];
            data[i].push([sampleNumber, dataPoint]);
            if (dataPoint < data[i].min) {
                data[i].min = dataPoint;
            }
            if (dataPoint > data[i].max) {
                data[i].max = dataPoint;
            }
        }
        while (data[0].length > 300) {
            for (let i = 0; i < data.length; i++) {
                data[i].shift();
            }
        }
        return sampleNumber + 1;
    }

    var margin = {top: 20, right: 10, bottom: 10, left: 40};
    function updateGraphHelperSize(helpers) {
        helpers.width = helpers.targetElement.width() - margin.left - margin.right;
        helpers.height = helpers.targetElement.height() - margin.top - margin.bottom;
        helpers.widthScale.range([0, helpers.width]);
        helpers.heightScale.range([helpers.height, 0]);
        helpers.xGrid.tickSize(-helpers.height, 0, 0);
        helpers.yGrid.tickSize(-helpers.width, 0, 0);
    }

    function initGraphHelpers(selector, sampleNumber, heightDomain) {
        var helpers = {selector: selector, targetElement: $(selector), dynamicHeightDomain: !heightDomain};
        helpers.widthScale = d3.scaleLinear().clamp(true).domain([(sampleNumber - 299), sampleNumber]);
        helpers.heightScale = d3.scaleLinear().clamp(true).domain(heightDomain || [1, -1]);
        helpers.xGrid = d3.axisBottom();
        helpers.yGrid = d3.axisLeft();
        updateGraphHelperSize(helpers);
        helpers.xGrid.scale(helpers.widthScale).ticks(5).tickFormat("");
        helpers.yGrid.scale(helpers.heightScale).ticks(5).tickFormat("");
        helpers.xAxis = d3.axisBottom().scale(helpers.widthScale).ticks(5).tickFormat(d => d);
        helpers.yAxis = d3.axisLeft().scale(helpers.heightScale).ticks(5).tickFormat(d => d);
        helpers.line = d3.line().x(d => helpers.widthScale(d[0])).y(d => helpers.heightScale(d[1]));
        return helpers;
    }

    function drawGraph(graphHelpers, data, sampleNumber) {
        var svg = d3.select(graphHelpers.selector);
        if (graphHelpers.dynamicHeightDomain) {
            var limits = [];
            $.each(data, function (idx, datum) {
                limits.push(datum.min);
                limits.push(datum.max);
            });
            graphHelpers.heightScale.domain(d3.extent(limits));
        }
        graphHelpers.widthScale.domain([(sampleNumber - 299), sampleNumber]);
        svg.select(".x.grid").call(graphHelpers.xGrid);
        svg.select(".y.grid").call(graphHelpers.yGrid);
        svg.select(".x.axis").call(graphHelpers.xAxis);
        svg.select(".y.axis").call(graphHelpers.yAxis);
        var group = svg.select("g.data");
        var lines = group.selectAll("path").data(data, function (d, i) {return i;});
        lines.enter().append("path").attr("class", "line");
        lines.attr('d', graphHelpers.line);
    }

    function plot_gyro(enable) { if (enable) { $('.wrapper.gyro').show(); } else { $('.wrapper.gyro').hide(); } }
    function plot_accel(enable) { if (enable) { $('.wrapper.accel').show(); } else { $('.wrapper.accel').hide(); } }
    function plot_mag(enable) { if (enable) { $('.wrapper.mag').show(); } else { $('.wrapper.mag').hide(); } }
    function plot_altitude(enable) { if (enable) { $('.wrapper.altitude').show(); } else { $('.wrapper.altitude').hide(); } }
    function plot_sonar(enable) { if (enable) { $('.wrapper.sonar').show(); } else { $('.wrapper.sonar').hide(); } }
    function plot_airspeed(enable) { if (enable) { $('.wrapper.airspeed').show(); } else { $('.wrapper.airspeed').hide(); } }
    function plot_temperature(enable) { if (enable) { $('.wrapper.temperature').show(); } else { $('.wrapper.temperature').hide(); } }
    function plot_debug(enable) { if (enable) { $('.wrapper.debug').show(); } else { $('.wrapper.debug').hide(); } }

    
    var checkboxes = $('.tab-sensors .info .checkboxes input');
    if (!BitHelper.bit_check(FC.CONFIG.activeSensors, 2)) checkboxes.eq(2).prop('disabled', true); // mag
    if (!BitHelper.bit_check(FC.CONFIG.activeSensors, 4)) checkboxes.eq(4).prop('disabled', true); // sonar
    if (!BitHelper.bit_check(FC.CONFIG.activeSensors, 6)) checkboxes.eq(5).prop('disabled', true); // airspeed
    if (!BitHelper.bit_check(FC.CONFIG.activeSensors, 7)) checkboxes.eq(6).prop('disabled', true); // debug


    $('.tab-sensors .info .checkboxes input').on('change', function () {
        
        

        var enable = $(this).prop('checked');
        var index = $(this).parent().index();
        switch (index) {
            case 0: plot_gyro(enable); break;
            case 1: plot_accel(enable); break;
            case 2: plot_mag(enable); break;
            case 3: plot_altitude(enable); break;
            case 4: plot_sonar(enable); break;
            case 5: plot_airspeed(enable); break;
            case 6: plot_temperature(enable); break;
            case 7: plot_debug(enable); break;
        }
        startPolling();
        store.set('graphs_enabled', Array.from($('.tab-sensors .info .checkboxes input')).map(cb => $(cb).prop('checked')));
    });


    const graphs_enabled = store.get('graphs_enabled', false);
    if (graphs_enabled) {
        var checkboxes = $('.tab-sensors .info .checkboxes input');
        for (var i = 0; i < graphs_enabled.length; i++) {
            checkboxes.eq(i).not(':disabled').prop('checked', graphs_enabled[i]).trigger('change');
        }
    } else {
        $('.tab-sensors .info input:lt(4):not(:disabled)').prop('checked', true).trigger('change');
    }

    initSensorData();

    var samples_gyro_i = 0, samples_accel_i = 0, samples_mag_i = 0,
        samples_altitude_i = 0, samples_sonar_i = 0, samples_airspeed_i = 0,
        samples_temperature_i = 0, samples_debug_i = 0;

    var gyro_data = initDataArray(3), accel_data = initDataArray(3), mag_data = initDataArray(3),
        altitude_data = initDataArray(2), sonar_data = initDataArray(1), airspeed_data = initDataArray(1),
        temperature_data = [initDataArray(1), initDataArray(1), initDataArray(1), initDataArray(1),
                            initDataArray(1), initDataArray(1), initDataArray(1), initDataArray(1)],
        debug_data = [initDataArray(1), initDataArray(1), initDataArray(1), initDataArray(1),
                        initDataArray(1), initDataArray(1), initDataArray(1), initDataArray(1)];

    var gyroHelpers = initGraphHelpers('#gyro', samples_gyro_i, [-2000, 2000]);
    var accelHelpers = initGraphHelpers('#accel', samples_accel_i, [-2, 2]);
    var magHelpers = initGraphHelpers('#mag', samples_mag_i, [-1, 1]);
    var altitudeHelpers = initGraphHelpers('#altitude', samples_altitude_i);
    var sonarHelpers = initGraphHelpers('#sonar', samples_sonar_i);
    var airspeedHelpers = initGraphHelpers('#airspeed', samples_airspeed_i);
    var temperatureHelpers = [
        initGraphHelpers('#temperature1', samples_temperature_i),
        initGraphHelpers('#temperature2', samples_temperature_i),
        initGraphHelpers('#temperature3', samples_temperature_i),
        initGraphHelpers('#temperature4', samples_temperature_i),
        initGraphHelpers('#temperature5', samples_temperature_i),
        initGraphHelpers('#temperature6', samples_temperature_i),
        initGraphHelpers('#temperature7', samples_temperature_i),
        initGraphHelpers('#temperature8', samples_temperature_i)
    ];
    var debugHelpers = [
        initGraphHelpers('#debug1', samples_debug_i),
        initGraphHelpers('#debug2', samples_debug_i),
        initGraphHelpers('#debug3', samples_debug_i),
        initGraphHelpers('#debug4', samples_debug_i),
        initGraphHelpers('#debug5', samples_debug_i),
        initGraphHelpers('#debug6', samples_debug_i),
        initGraphHelpers('#debug7', samples_debug_i),
        initGraphHelpers('#debug8', samples_debug_i)
    ];

    var raw_data_text_ements = { x: [], y: [], z: [] };
    $('.plot_control .x, .plot_control .y, .plot_control .z').each(function () {
        var el = $(this);
        if (el.hasClass('x')) raw_data_text_ements.x.push(el);
        else if (el.hasClass('y')) raw_data_text_ements.y.push(el);
        else raw_data_text_ements.z.push(el);
    });

    const sensor_settings = store.get('sensor_settings', false);
    if (sensor_settings) {
        $('.tab-sensors select[name="gyro_refresh_rate"]').val(sensor_settings.rates.gyro);
        $('.tab-sensors select[name="gyro_scale"]').val(sensor_settings.scales.gyro);
        $('.tab-sensors select[name="accel_refresh_rate"]').val(sensor_settings.rates.accel);
        $('.tab-sensors select[name="accel_scale"]').val(sensor_settings.scales.accel);
        $('.tab-sensors select[name="mag_refresh_rate"]').val(sensor_settings.rates.mag);
        $('.tab-sensors select[name="mag_scale"]').val(sensor_settings.scales.mag);
        $('.tab-sensors select[name="baro_refresh_rate"]').val(sensor_settings.rates.baro);
        $('.tab-sensors select[name="sonar_refresh_rate"]').val(sensor_settings.rates.sonar);
        $('.tab-sensors select[name="airspeed_refresh_rate"]').val(sensor_settings.rates.airspeed);
        $('.tab-sensors select[name="debug_refresh_rate"]').val(sensor_settings.rates.debug);
    }

    if ($('#subtab-pid_dupe').hasClass('subtab__content--current')) {
        startPolling();
    }

    $('.tab-sensors .rate select, .tab-sensors .scale select').on('change', function () {
        if ($('#subtab-pid_dupe').hasClass('subtab__content--current')) {
            startPolling();
        }
    });

    $('.subtab__header_label').on('click', function() {
        setTimeout(function() {
            const isSensorsActiveNow = $('#subtab-pid_dupe').hasClass('subtab__content--current');
            if (isSensorsActiveNow) {
                console.log('Sensors tab activated, starting polling');
                startPolling();
            } else {
                console.log('Sensors tab deactivated, stopping polling');
                interval.killAll(['IMU_pull', 'altitude_pull', 'sonar_pull', 'airspeed_pull', 'temperature_pull', 'debug_pull']);
            }
        }, 100);
    });

    $("a.debug-trace").on('click', function () {
        var debugWin = window.open("tabs/debug_trace.html", "receiver_msp", "width=500,height=510,menubar=no,contextIsolation=no,nodeIntegration=yes");
        debugWin.window.getDebugTrace = function () { return FC.DEBUG_TRACE || ''; };
    });

    function startPolling() {

        var rates = {
            'gyro': parseInt($('.tab-sensors select[name="gyro_refresh_rate"]').val(), 10),
            'accel': parseInt($('.tab-sensors select[name="accel_refresh_rate"]').val(), 10),
            'mag': parseInt($('.tab-sensors select[name="mag_refresh_rate"]').val(), 10),
            'baro': parseInt($('.tab-sensors select[name="baro_refresh_rate"]').val(), 10),
            'sonar': parseInt($('.tab-sensors select[name="sonar_refresh_rate"]').val(), 10),
            'airspeed': parseInt($('.tab-sensors select[name="airspeed_refresh_rate"]').val(), 10),
            'debug': parseInt($('.tab-sensors select[name="debug_refresh_rate"]').val(), 10)
        };

        var scales = {
            'gyro': parseFloat($('.tab-sensors select[name="gyro_scale"]').val()),
            'accel': parseFloat($('.tab-sensors select[name="accel_scale"]').val()),
            'mag': parseFloat($('.tab-sensors select[name="mag_scale"]').val())
        };

        var fastest = d3.min([rates.gyro, rates.accel, rates.mag]);
        store.set('sensor_settings', {'rates': rates, 'scales': scales});

        // re-initialize domains with new scales
        gyroHelpers = initGraphHelpers('#gyro', samples_gyro_i, [-scales.gyro, scales.gyro]);
        accelHelpers = initGraphHelpers('#accel', samples_accel_i, [-scales.accel, scales.accel]);
        magHelpers = initGraphHelpers('#mag', samples_mag_i, [-scales.mag, scales.mag]);

        // fetch currently enabled plots
        var checkboxes = [];
        $('.tab-sensors .info .checkboxes input').each(function () {
            checkboxes.push($(this).prop('checked'));
        });

        // timer initialization
        interval.killAll(['status_pull', 'global_data_refresh', 'msp-load-update', 'ltm-connection-check']);

        // data pulling timers
        if (checkboxes[0] || checkboxes[1] || checkboxes[2]) {
            interval.add('IMU_pull', function () {
                MSP.send_message(MSPCodes.MSP_RAW_IMU, false, false, update_imu_graphs);
            }, fastest, true);
        }
        if (checkboxes[3]) {
            interval.add('altitude_pull', function () {
                MSP.send_message(MSPCodes.MSP_ALTITUDE, false, false, update_altitude_graph);
            }, rates.baro, true);
        }
        if (checkboxes[4]) {
            interval.add('sonar_pull', function () {
                MSP.send_message(MSPCodes.MSP_SONAR, false, false, update_sonar_graphs);
            }, rates.sonar, true);
        }
        if (checkboxes[5]) {
            interval.add('airspeed_pull', function () {
                MSP.send_message(MSPCodes.MSPV2_INAV_AIR_SPEED, false, false, update_airspeed_graphs);
            }, rates.airspeed, true);
        }
        if (checkboxes[6]) {
            interval.add('temperature_pull', function () {
                MSP.send_message(MSPCodes.MSP2_INAV_TEMPERATURES, false, false, update_temperature_graphs);
            }, 1000, true);
        }
        if (checkboxes[7]) {
            interval.add('debug_pull', function () {
                MSP.send_message(MSPCodes.MSP2_INAV_DEBUG, false, false, update_debug_graphs);
            }, rates.debug, true);
        }

        function update_imu_graphs() {
            if (checkboxes[0]) {
                updateGraphHelperSize(gyroHelpers);
                samples_gyro_i = addSampleToData(gyro_data, samples_gyro_i, FC.SENSOR_DATA.gyroscope);
                drawGraph(gyroHelpers, gyro_data, samples_gyro_i);
                raw_data_text_ements.x[0].text(FC.SENSOR_DATA.gyroscope[0].toFixed(2));
                raw_data_text_ements.y[0].text(FC.SENSOR_DATA.gyroscope[1].toFixed(2));
                raw_data_text_ements.z[0].text(FC.SENSOR_DATA.gyroscope[2].toFixed(2));
            }
            if (checkboxes[1]) {
                updateGraphHelperSize(accelHelpers);
                samples_accel_i = addSampleToData(accel_data, samples_accel_i, FC.SENSOR_DATA.accelerometer);
                drawGraph(accelHelpers, accel_data, samples_accel_i);
                raw_data_text_ements.x[1].text(FC.SENSOR_DATA.accelerometer[0].toFixed(2));
                raw_data_text_ements.y[1].text(FC.SENSOR_DATA.accelerometer[1].toFixed(2));
                raw_data_text_ements.z[1].text(FC.SENSOR_DATA.accelerometer[2].toFixed(2));
            }
            if (checkboxes[2]) {
                updateGraphHelperSize(magHelpers);
                samples_mag_i = addSampleToData(mag_data, samples_mag_i, FC.SENSOR_DATA.magnetometer);
                drawGraph(magHelpers, mag_data, samples_mag_i);
                raw_data_text_ements.x[2].text(FC.SENSOR_DATA.magnetometer[0].toFixed(2));
                raw_data_text_ements.y[2].text(FC.SENSOR_DATA.magnetometer[1].toFixed(2));
                raw_data_text_ements.z[2].text(FC.SENSOR_DATA.magnetometer[2].toFixed(2));
            }
        }

        function update_altitude_graph() {
            updateGraphHelperSize(altitudeHelpers);
            samples_altitude_i = addSampleToData(altitude_data, samples_altitude_i, [FC.SENSOR_DATA.altitude, FC.SENSOR_DATA.barometer]);
            drawGraph(altitudeHelpers, altitude_data, samples_altitude_i);
            raw_data_text_ements.x[3].text(FC.SENSOR_DATA.altitude.toFixed(2));
            raw_data_text_ements.y[3].text(FC.SENSOR_DATA.barometer.toFixed(2));
        }

        function update_sonar_graphs() {
            updateGraphHelperSize(sonarHelpers);
            samples_sonar_i = addSampleToData(sonar_data, samples_sonar_i, [FC.SENSOR_DATA.sonar]);
            drawGraph(sonarHelpers, sonar_data, samples_sonar_i);
            raw_data_text_ements.x[4].text(FC.SENSOR_DATA.sonar.toFixed(2));
        }

        function update_airspeed_graphs() {
            updateGraphHelperSize(airspeedHelpers);
            samples_airspeed_i = addSampleToData(airspeed_data, samples_airspeed_i, [FC.SENSOR_DATA.air_speed]);
            drawGraph(airspeedHelpers, airspeed_data, samples_airspeed_i);
            raw_data_text_ements.x[5].text(FC.SENSOR_DATA.air_speed);
        }

        function update_temperature_graphs() {
            for (var i = 0; i < 8; i++) {
                updateGraphHelperSize(temperatureHelpers[i]);
                addSampleToData(temperature_data[i], samples_temperature_i, [FC.SENSOR_DATA.temperature[i]]);
                drawGraph(temperatureHelpers[i], temperature_data[i], samples_temperature_i);
                raw_data_text_ements.x[6 + i].text(FC.SENSOR_DATA.temperature[i]);
            }
            samples_temperature_i++;
        }

        function update_debug_graphs() {
            for (var i = 0; i < 8; i++) {
                updateGraphHelperSize(debugHelpers[i]);
                addSampleToData(debug_data[i], samples_debug_i, [FC.SENSOR_DATA.debug[i]]);
                drawGraph(debugHelpers[i], debug_data[i], samples_debug_i);
                raw_data_text_ements.x[6 + 8 + i].text(FC.SENSOR_DATA.debug[i]);
            }
            samples_debug_i++;
        }
    }
    }
        
    async function initOSDTab (){
        console.log('[PID_DUPE] initOSDTab called');

        // Проверка: загружен ли модуль OSD
        if (typeof OSD === 'undefined' || !OSD.GUI) {
            console.error('[PID_DUPE] OSD module not loaded!');
            return;
        }

        const $osdContent = $('#subtab-filters');
        const isOSDActive = $osdContent.hasClass('subtab__content--current');

        console.log('[PID_DUPE] OSD Active:', isOSDActive);

        try {
            FONT.initData();
            HARDWARE.init();
            
            if (!FONT.data.characters || FONT.data.characters.length === 0) {
                console.log('[PID_DUPE] Loading default font...');
                const response = await import('./../resources/osd/analogue/default.mcm?raw');
                FONT.parseMCMFontFile(response.default);
                console.log('[PID_DUPE] Font loaded, characters count:', FONT.data.characters.length);
            }

            if (!OSD.data || !OSD.data.supported) {
                await new Promise((resolve, reject) => {
                    OSD.reload(() => {
                        OSD.data.supported ? resolve() : reject(new Error('OSD not supported'));
                    });
                });
            }

            OSD.updateDisplaySize();

            OSD.GUI.updateAll();

            setTimeout(() => {
                $('.preview .char img').css('pointer-events', 'none');
                OSD.GUI.updateGuidesView($('#videoGuides input').is(':checked'));
            }, 50);

            console.log('[PID_DUPE] OSD tab initialized successfully');
            
            } catch (err) {
                console.error('[PID_DUPE] OSD init failed:', err);
            }

        }
    


    function process_html() {
        
        i18n.localize();

        $('#ez_tune_enabled').on('change', function () {
            if ($(this).is(":checked")) {
                FC.EZ_TUNE.enabled = 1;
            } else {
                FC.EZ_TUNE.enabled = 0;
            }

            if (FC.EZ_TUNE.enabled) {
                $('.for-ez-tune').show();
                $('.not-for-ez-tune').hide();
            } else {
                $('.for-ez-tune').hide();
                $('.not-for-ez-tune').show();
            }
        });

        if (!FC.isMultirotor()) {
            $('#ez-tune-switch').hide();
            $('.only-for-multirotor').hide();
        }

        if (FC.isMultirotor()) {
            $('.not-for-multirotor').hide();
        }

        $("#ez_tune_enabled").prop('checked', FC.EZ_TUNE.enabled).trigger('change');

        GUI.sliderize($('#ez_tune_filter_hz'), FC.EZ_TUNE.filterHz, 20, 300);
        GUI.sliderize($('#ez_tune_axis_ratio'), FC.EZ_TUNE.axisRatio, 25, 175);
        GUI.sliderize($('#ez_tune_response'), FC.EZ_TUNE.response, 0, 200);
        GUI.sliderize($('#ez_tune_damping'), FC.EZ_TUNE.damping, 0, 200);
        GUI.sliderize($('#ez_tune_stability'), FC.EZ_TUNE.stability, 0, 200);
        GUI.sliderize($('#ez_tune_aggressiveness'), FC.EZ_TUNE.aggressiveness, 0, 200);

        GUI.sliderize($('#ez_tune_rate'), FC.EZ_TUNE.rate, 0, 200);
        GUI.sliderize($('#ez_tune_expo'), FC.EZ_TUNE.expo, 0, 200);

        GUI.sliderize($('#ez_tune_snappiness'), FC.EZ_TUNE.snappiness, 0, 100);

        $('.ez-element').on('updated', function () {
            updatePreview();
        });

        //Slider rates
        GUI.sliderize($('#rate_roll_rate'), FC.RC_tuning.roll_rate, 40, 1000);
        GUI.sliderize($('#rate_pitch_rate'), FC.RC_tuning.pitch_rate, 40, 1000);
        GUI.sliderize($('#rate_yaw_rate'), FC.RC_tuning.yaw_rate, 40, 1000);

        GUI.sliderize($('#rate_rollpitch_expo'), FC.RC_tuning.RC_EXPO * 100, 0, 100);
        GUI.sliderize($('#rate_yaw_expo'), FC.RC_tuning.RC_YAW_EXPO * 100, 0, 100);

        GUI.sliderize($('#rate_manual_roll'), FC.RC_tuning.manual_roll_rate, 0, 100);
        GUI.sliderize($('#rate_manual_pitch'), FC.RC_tuning.manual_pitch_rate, 0, 100);
        GUI.sliderize($('#rate_manual_yaw'), FC.RC_tuning.manual_yaw_rate, 0, 100);

        GUI.sliderize($('#manual_rollpitch_expo'), FC.RC_tuning.manual_RC_EXPO * 100, 0, 100);
        GUI.sliderize($('#manual_yaw_expo'), FC.RC_tuning.manual_RC_YAW_EXPO * 100, 0, 100);

        updatePreview();

        tabs.init($('.tab-pid_tuning_dupe'));

        // Проверка: какая подвкладка активна? (отключена)
        const isSensorsActive = $('#subtab-pid_dupe').hasClass('subtab__content--current');
        const isOSDActive = $('#subtab-filters').hasClass('subtab__content--current');

        console.log('Tab check:', { isSensorsActive, isOSDActive, activeTab: GUI.active_tab });

        initSensorsTab();initOSDTab();

        $('.action-resetPIDs').on('click', function() {

            if (dialog.confirm(i18n.getMessage('confirm_reset_pid'))) {
                MSP.send_message(MSPCodes.MSP_SET_RESET_CURR_PID, false, false, false);
                GUI.updateActivatedTab();
            }
        });

        $('.action-resetDefaults').on('click', function() {

            if (dialog.confirm(i18n.getMessage('confirm_select_defaults'))) {
                mspHelper.setSetting("applied_defaults", 0, function() { 
                    mspHelper.saveToEeprom( function () {
                        GUI.log(i18n.getMessage('configurationEepromSaved'));
    
                        GUI.tab_switch_cleanup(function () {
                            MSP.send_message(MSPCodes.MSP_SET_REBOOT, false, false, function () {
                                GUI.log(i18n.getMessage('deviceRebooting'));
                                GUI.handleReconnect();
                            });
                        });
                    });
                });
            }
        });

        pid_and_rc_to_form();

        $(".pid-slider-row [name='value-slider']").on('input', function () {
            let val = $(this).val();
            let normalMax = parseInt($(this).data('normal-max'));

            if (val <= 800) {
                val = scaleRangeInt(val, 0, 800, 0, normalMax);
            } else {
                val = scaleRangeInt(val, 801, 1000, normalMax + 1, 255);
            }

            $(this).parent().find('input[name="value-input"]').val(val);
            FC.PIDs[$(this).parent().data('axis')][$(this).parent().data('bank')] = val;
        });

        $(".pid-slider-row [name='value-input']").on('change', function () {
            let val = $(this).val();
            let newVal;
            let normalMax = parseInt($(this).parent().find('input[name="value-slider"]').data('normal-max'));

            if (val <= 110) {
                newVal = scaleRangeInt(val, 0, normalMax, 0, 800);
            } else {
                newVal = scaleRangeInt(val, normalMax + 1, 255, 801, 1000);
            }

            $(this).parent().find('input[name="value-slider"]').val(newVal);
            FC.PIDs[$(this).parent().data('axis')][$(this).parent().data('bank')] = $(this).val();
        });

        let axis = 0;
        $('#pid-sliders').find('.pid-sliders-axis').each(function () {
        
            let $this = $(this);
            let bank = 0;

            $this.find('.pid-slider-row').each(function () {
                let $this = $(this);
                $this.data('axis', axis);
                $this.data('bank', bank);
                $this.find('input[name="value-input"]').val(FC.PIDs[axis][bank]).trigger('change');
                bank++;
            });
        
            axis++;
        });

        GUI.sliderize($('#rate_dynamics_center_sensitivity'), FC.RATE_DYNAMICS.sensitivityCenter, 25, 175);
        GUI.sliderize($('#rate_dynamics_end_sensitivity'), FC.RATE_DYNAMICS.sensitivityEnd, 25, 175);

        GUI.sliderize($('#rate_dynamics_center_correction'), FC.RATE_DYNAMICS.correctionCenter, 10, 95);
        GUI.sliderize($('#rate_dynamics_end_correction'), FC.RATE_DYNAMICS.correctionEnd, 10, 95);

        GUI.sliderize($('#rate_dynamics_center_weight'), FC.RATE_DYNAMICS.weightCenter, 0, 95);
        GUI.sliderize($('#rate_dynamics_end_weight'), FC.RATE_DYNAMICS.weightEnd, 0, 95);

        if (!FC.isRpyFfComponentUsed()) {
            $('.rpy_ff').prop('disabled', 'disabled');
        }
        if (!FC.isRpyDComponentUsed()) {
            $('.rpy_d').prop('disabled', 'disabled');
        }

        interval.add("drawRollPitchYawExpo", function () {
            drawRollPitchYawExpo();
        }, 100);

        GUI.simpleBind();

        // UI Hooks

        $('a.refresh').on('click', function () {
            $("#content-watermark").remove();
            $(".tab-pid_tuning_dupe").remove();

            GUI.tab_switch_cleanup(function () {
                GUI.log(i18n.getMessage('pidTuningDataRefreshed'));
                TABS.pid_tuning_dupe.initialize();
            });
        });

        // update == save.
        $('a.update').on('click', function () {
            form_to_pid_and_rc();

            if ($("#ez_tune_enabled").is(":checked")) {
                FC.EZ_TUNE.enabled = 1;
            } else {
                FC.EZ_TUNE.enabled = 0;
            }

            FC.EZ_TUNE.filterHz = $('#ez_tune_filter_hz').val();
            FC.EZ_TUNE.axisRatio = $('#ez_tune_axis_ratio').val();
            FC.EZ_TUNE.response = $('#ez_tune_response').val();
            FC.EZ_TUNE.damping = $('#ez_tune_damping').val();
            FC.EZ_TUNE.stability = $('#ez_tune_stability').val();
            FC.EZ_TUNE.aggressiveness = $('#ez_tune_aggressiveness').val();
            FC.EZ_TUNE.rate = $('#ez_tune_rate').val();
            FC.EZ_TUNE.expo = $('#ez_tune_expo').val();
            FC.EZ_TUNE.snappiness = $('#ez_tune_snappiness').val();

            function send_rc_tuning_changes() {
                MSP.send_message(MSPCodes.MSPV2_INAV_SET_RATE_PROFILE, mspHelper.crunch(MSPCodes.MSPV2_INAV_SET_RATE_PROFILE), false, saveRateDynamics);
            }

            function saveRateDynamics() {
                mspHelper.saveRateDynamics(saveEzTune);
            }

            function saveEzTune() {
                mspHelper.saveEzTune(saveSettings)
            }

            function saveSettings() {
                Settings.saveInputs(save_to_eeprom);
            }

            function save_to_eeprom() {
                MSP.send_message(MSPCodes.MSP_EEPROM_WRITE, false, false, function () {
                    GUI.log(i18n.getMessage('pidTuningEepromSaved'));
                });
            }

            mspHelper.savePidData(send_rc_tuning_changes); 
        });

        GUI.content_ready(callback);
    }
};

TABS.pid_tuning_dupe.cleanup = function (callback) {
    if (callback) {
        callback();
    }
};
