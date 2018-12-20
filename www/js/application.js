/*******************************************************
 * some global constants
 ****************************************************/
var simulate = false;
var player = false;
var timeout = simulate ? 3 : 10;

// external services
var deezerUrl = "https://www.deezer.com/en/track/";
var spotifyUrl = "https://open.spotify.com/track/";
var youtubeUrl = "https://www.youtube.com/watch?v=";

/*******************************************************/

function Application(UIContext) {
  this._uiContextClass = UIContext;
  this._initialized = false;
}

Application.prototype.init = function () {
  if (this._uiContextClass && !this._initialized) {
    this._initialized = true;
    UI = new this._uiContextClass();
    UI.init();

    UI.pagestack.push("main");
    $("#settingsBtn").click(function () {
      document.getElementById("hostInput").value = localStorage.getItem("hostInput");
      document.getElementById("keyInput").value = localStorage.getItem("keyInput");
      document.getElementById("secretInput").value = localStorage.getItem("secretInput");
      UI.pagestack.push("settings");
    });

    $("#save").click(function () {
      if (typeof (Storage) !== "undefined") {
        localStorage.setItem("hostInput", document.getElementById("hostInput").value);
        localStorage.setItem("keyInput", document.getElementById("keyInput").value);
        localStorage.setItem("secretInput", document.getElementById("secretInput").value);
      } else {
        alert("Sorry! No Web Storage support..");
      }
      UI.pagestack.pop("settings");
    });

    var recorder;
    var chunks;

    // request permission to access audio stream
    navigator.mediaDevices.getUserMedia({audio: true}).then(stream => {
      try {
        recorder = new MediaRecorder(stream);
      } catch (e) {
        console.error("Exception on creating MediaRecorder: " + e);
      }
      // function to be called when data is received
      recorder.ondataavailable = e => {
        // add stream data to chunks
        chunks.push(e.data);
        // if recorder is 'inactive' then recording has finished
        if (recorder.state == 'inactive') {

          $('#result').addClass('spinner');

          // convert stream data chunks to a 'webm' audio format as a blob
          console.debug("RECORDER IS INACTIVE");
          let blob = new Blob(chunks, {type: 'audio/webm'});

          if (!simulate) {
            identify(blob, blob.size, getConfig(), function (err, httpResponse, body) {
              if (err) console.log(err);
              console.log(body);
            });
          } else {
            setTimeout(() => {
              processResult(null, null);
            }, 3000);
          }

          // convert blob to URL so it can be assigned to a audio src attribute
          if (player) {
            $('#debugPlayer').empty();
            createAudioElement(URL.createObjectURL(blob), $('#debugPlayer'));
          }
        }
      };
    }).catch(function (err) {
      console.debug("ERROR on creating UserMedia: " + err);
    });

    var recButton = $('#record');
    var timerId;

    recButton.click(function () {

      if (!simulate && needSetup()) {
        processResult("Please enter settings first!", true);
        return;
      }

      if (recorder.state !== 'recording') {

        $("#microphone").removeClass("mic").addClass("mic-rec");
        recButton.addClass('recording');
        recButton.addClass("button-glow");

        $("#resultList").empty();
        $("#externalLinks").empty();

        chunks = [];
        recorder.start();
        console.debug("RECORDER STARTED");

        // prepare timer
        var counter = timeout;
        var timerElem = $("#timer");
        timerElem.html(counter);
        timerElem.show();

        // start timer
        timerId = setInterval(() => {
          // this will trigger one final 'ondataavailable' event and set recorder state to 'inactive'
          counter--;
          //console.debug("timer: " + counter);
          timerElem.html(counter);

          if (counter < 1 && recorder.state == 'recording') {
            stopRecorderAddtionalStuff(timerId, recorder);
            console.debug("RECORDER STOPPED BY TIMEOUT");
          }
        }, 1000);
      } else {
        stopRecorderAddtionalStuff(timerId, recorder);
        console.debug("RECORDER STOPPED");
        $('#result').addClass('spinner');
      }
    });
  }
};

Application.prototype.initialized = function () {
  return this._initialized;
};

function stopRecorderAddtionalStuff(timerId, recorder) {
  var timerElem = $("#timer");
  var recButton = $('#record');

  timerElem.hide();
  timerElem.empty();
  clearInterval(timerId);
  recorder.stop();
  recButton.removeClass('recording');
  recButton.removeClass('recording');
  recButton.removeClass("button-glow");
  recButton.prop("disabled",true);
  $("#microphone").removeClass("mic-rec").addClass("mic");
}

function needSetup() {
  return !localStorage.getItem("hostInput") ||
         !localStorage.getItem("keyInput") ||
         !localStorage.getItem("secretInput");
}

function getConfig() {
  return {
    host: simulate ? "simulate" : localStorage.getItem("hostInput"),
    endpoint: '/v1/identify',
    signature_version: 1,
    data_type: 'audio',
    secure: true,
    access_key: simulate ? "simulate" : localStorage.getItem("keyInput"),
    access_secret: simulate ? "simulate" : localStorage.getItem("secretInput"),
  };
}

function processResult(result, requestError) {
  // we have a result -> remove spinner
  $('#result').removeClass('spinner');
  $('#record').prop("disabled", false);

    if(simulate)
        result = simulationResult;

  var list = $("#resultList");
  list.empty();

  if (requestError) {
    list.append("<li>requestError: " + result + "</li>");
    return;
  }

  // in case of an error
  if (result.status) {
    let data = result.status;
    if (data["code"] !== 0) {
      for (var elem in data) {
        if (typeof data[elem] !== "object")
          list.append("<li>" + elem + ": " + data[elem] + "</li>");
        if (data[elem].name)
          list.append("<li>" + elem + ": " + data[elem].name + "</li>");
      }
      return;
    }
  }

  var dataList = result.metadata.music;

  var elements = ["artists", "genres", "title", "release_date", "label", "album"];
  list.append(recurse(dataList[0], elements));

  // add external service links
  processExternalMetadata(dataList[0].external_metadata);
};

function processExternalMetadata(externalMetadata) {
  var element = $("#externalLinks");
  element.empty();

  // deezer
  deezerId = externalMetadata.deezer.track.id;
  if (deezerId) {
    element.append("<a href='" + deezerUrl + deezerId + "' target='_blank'><div class='serviceLink' id='deezer' /></a>");
  }
  // spotify
  spotifyId = externalMetadata.spotify.track.id;
  if (spotifyId) {
    element.append("<a href='" + spotifyUrl + spotifyId + "' target='_blank'><div class='serviceLink' id='spotify' /></a>");
  }
  // youtube
  youtubeId = externalMetadata.youtube.vid;
  if (youtubeId) {
    element.append("<a href='" + youtubeUrl + youtubeId + "' target='_blank'><div class='serviceLink' id='youtube' /></a>");
  }

}

function recurse(data, elements) {
  var htmlRetStr = "<ul class='recurseObj'>";
  for (var key in data) {
    if (elements === null || elements.includes(key)) {
      if (typeof (data[key]) == 'object' && data[key] != null) {
        if (data[key].name)
          htmlRetStr += "<li><strong>" + capitalizeFirstLetter(key) + ":</strong> " + data[key].name + "</li>";
        else if (data[key].length !== "NaN") {
          var arr = data[key];
          htmlRetStr += "<li><strong>" + capitalizeFirstLetter(key) + ":</strong> ";
          for (var elem in arr) {
            htmlRetStr += arr[elem].name;
            if (parseInt(elem) + 1 < arr.length)
              htmlRetStr += ", ";
          }
          htmlRetStr += "</li>";
        } else {
          htmlRetStr += "<li class='keyObj' ><strong>" + capitalizeFirstLetter(key) + ":</strong><ul class='recurseSubObj'>";
          htmlRetStr += recurse(data[key], elements);
          htmlRetStr += '</ul></li>';
        }
      } else {
        htmlRetStr += ("<li class='keyStr'><strong>" + capitalizeFirstLetter(key) + ': </strong>' + data[key] + '</li>');
      }
    }
  }
  ;
  htmlRetStr += '</ul>';
  return (htmlRetStr);
};

// appends an audio element to playback and download recording
function createAudioElement(blobUrl, parent) {
  const downloadEl = document.createElement('a');
  downloadEl.style = 'display: block';
  downloadEl.innerHTML = 'download';
  downloadEl.download = 'audio.webm';
  downloadEl.href = blobUrl;
  const audioEl = document.createElement('audio');
  audioEl.controls = true;
  const sourceEl = document.createElement('source');
  sourceEl.src = blobUrl;
  sourceEl.type = 'audio/webm';
  audioEl.appendChild(sourceEl);
  parent.append(audioEl);
  parent.append(downloadEl);
}

function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}