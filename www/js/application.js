function Application(UIContext) {
    this._uiContextClass = UIContext;
    this._initialized = false;
};
Application.prototype.init = function() {
    if (this._uiContextClass && !this._initialized) {
        this._initialized = true;
        var UI = new this._uiContextClass();
        UI.init();
    }
    
    var debug = true;

    var defaultOptions = {
        host: 'identify-eu-west-1.acrcloud.com',
        endpoint: '/v1/identify',
        signature_version: 1,
        data_type:'audio',
        secure: true,
        access_key: 'xxx',
        access_secret: 'xxx',
        //audio_format: 'wav',
        //channels: 2,
        //sample_rate: 44100
    };
    
    var audio_context = new AudioContext;
    var rec;
    
    navigator.getUserMedia({audio: true}, function(stream){
        var input = audio_context.createMediaStreamSource(stream);
        console.log('Media stream created.');
        // Uncomment if you want the audio to feedback directly
        //input.connect(audio_context.destination);
        //console.log('Input connected to audio context destination.');
        
        rec = new Recorder(input);
        console.log('Recorder initialised.');
      }       
      ,function(e) {
        console.log('No live audio input: ' + e);
    });

    var recButton = $('#record')

    // prevent openening contextmenu
    recButton.bind('contextmenu', function(e) {
        e.preventDefault();
        return false;
    }, false);
    
    recButton.mousedown(function() {
        //console.log("record start");
        if(!debug) {
            rec.clear();
            rec.record();
        }
    });
    recButton.mouseup(function() {
        if(debug)
            processResult(null);
        else {
            rec.stop();
            rec.exportWAV(function(wav){
                identify(wav, wav.size, defaultOptions, function (err, httpResponse, body) {
                    if (err) console.log(err);
                    console.log(body);
                });
            });
        }
    });
};

Application.prototype.initialized = function() {
    return this._initialized;
};

function startUserMedia(stream) {
    var input = audio_context.createMediaStreamSource(stream);
    console.log('Media stream created.');
    // Uncomment if you want the audio to feedback directly
    //input.connect(audio_context.destination);
    //console.log('Input connected to audio context destination.');
    
    rec = new Recorder(input);
    console.log('Recorder initialised.');
};

function processResult(result) {
    result = JSON.parse('{"status":{"msg":"Success","code":0,"version":"1.0"},"metadata":{"music":[{"external_ids":{"isrc":"DEUM70805429","upc":"602517837317"},"play_offset_ms":40740,"external_metadata":{"youtube":{"vid":"og4eNv9PtnQ"},"spotify":{"album":{"name":"Of All The Things","id":"5UfXvVB6oMHgnuT25R5jAs"},"artists":[{"name":"Jazzanova","id":"0nTErwSOllrcUWt3knOG2T"},{"name":"Phonte Coleman","id":"0p9LVcPuUXYtvXaouzQpAs"}],"track":{"name":"Look What You\'re Doin\' To Me","id":"7Izc0eVXAcS1JDYOqM6yzJ"}},"deezer":{"album":{"name":"Of All The Things","id":"223864"},"artists":[{"name":"Jazzanova","id":"4065"},{"name":"Phonte Coleman","id":"4438197"}],"track":{"name":"Look What You\'re Doin\' To Me","id":"2238873"}}},"artists":[{"name":"Jazzanova"}],"genres":[{"name":"Jazz"}],"title":"Look What You\'re Doin\' To Me","release_date":"2008-01-01","label":"Universal Music","duration_ms":181080,"album":{"name":"Of All The Things"},"acrid":"271d59a6f5786143b5617b3560c29976","result_from":3,"score":100}],"timestamp_utc":"2018-03-22 00:08:23"},"cost_time":1.6920001506805,"result_type":0}');
    var dataList = result.metadata.music;
    var list = $("#resultList");
    list.empty();
    for (var i=0; i<dataList.length;i++) {
        let data = dataList[i];
        for(var elem in data) {
            if(typeof data[elem] !== "object")
                list.append("<li>"+elem+": "+ data[elem] +"</li>");
            if(data[elem].name)
                list.append("<li>"+elem+": "+ data[elem].name +"</li>");
        }
    }
};