/*******************************************************
 * some global constants
 ****************************************************/
var simulate = false;
var player = false;

// external services
var deezerUrl = "https://www.deezer.com/en/track/";
var spotifyUrl = "https://open.spotify.com/track/";
var youtubeUrl = "https://www.youtube.com/watch?v=";

var resultProperties = ["artists", "genres", "title", "release_date", "label", "album"];
var UI;
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

    document.querySelector('#switchSimulation').addEventListener('change', function(e, i) {
      if (e.srcElement.checked === true) {
        simulate = true;
      } else {
        simulate = false;
      }
    });

    $("#historyBtn").click(function () {
      prepareHistoryList();
      UI.pagestack.push("history");
    });

    $("#jqAccordion").accordion({
      collapsible: true,
      active: false,
      heightStyle: "content",
      animate: 100
    });

    //////////////////////////////////// main /////////////////////////////////////////

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
            identify(blob, blob.size, getConfig(), processResult);
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
        $('#result').removeClass('spinner');
        $('#record').prop("disabled", false);
        var list = $("#resultList");
        list.empty();
        list.append("<li>Please enter settings first!</li>");
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
        var counter = simulate ? 3 : 10;
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

function processResult(result, xhr, originalBlob) {
  // we have a result -> remove spinner
  $('#result').removeClass('spinner');
  $('#record').prop("disabled", false);

  var timestamp = new Date().toLocaleString();
  var resultObject = {"timestamp": timestamp, "result": null, "message": "", "status": ""};

  if(simulate)
    result = simulationResult;

  var list = $("#resultList");
  list.empty();

  // in case of no result
  if (xhr.status != 200) {
    if(xhr.status < 200 || xhr.status >= 304 /*no internet/timeout/connectionerror*/) {
      //option to save blob for later recognition
      if(originalBlob) {
        fileReader = new FileReader();
        fileReader.onload = function (evt) {
          // Read out file contents as a Data URL
          resultObject.blob = evt.target.result;
          resultObject.message = "No internet connection";
          resultObject.status = "failed";
          addToHistory(resultObject);
        };
        // Load blob as Data URL
        fileReader.readAsDataURL(originalBlob);
        // read blob from stored object??: blob = new Blob(responseObject.blob, {type: "audio/webm"});
        list.append("<li><strong>No internet connection!</strong></li>");
        list.append("<li>The recording has been saved.</li>");
        list.append("<li>You can execute the recognition from the history again.</li>");
      }
    } else {
      list.append("<li>requestError: " + result + "</li>");
    }
    return;
  }

  // in case of a negative result
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

  var dataList = result.metadata.music[0];

  list.append(recurseCreateList(dataList, resultProperties));

  // add external service links
  var extLinks = $("#externalLinks");
  processExternalMetadata(dataList, extLinks);

  //write History
  if(!simulate) {
    resultObject.result = dataList;
    resultObject.status = "success";
    resultObject.message = dataList.artists[0].name +" - "+ dataList.title;
    addToHistory(resultObject);
  }
};

function processExternalMetadata(data, element) {
  var externalMetadata = data.external_metadata;
  element.empty();

  // deezer
  deezerId = externalMetadata.deezer ? externalMetadata.deezer.track.id : null;
  if (deezerId) {
    element.append("<a href='" + deezerUrl + deezerId + "' target='_blank'><div class='serviceLink deezer' /></a>");
  }
  // spotify
  spotifyId = externalMetadata.spotify ? externalMetadata.spotify.track.id : null;
  if (spotifyId) {
    element.append("<a href='" + spotifyUrl + spotifyId + "' target='_blank'><div class='serviceLink spotify' /></a>");
  }
  // youtube
  youtubeId = externalMetadata.youtube ? externalMetadata.youtube.vid : null;
  if (youtubeId) {
    element.append("<a href='" + youtubeUrl + youtubeId + "' target='_blank'><div class='serviceLink youtube' /></a>");
  }

  // copy to clipboard
  var copyElem = $("<a href='#'><div class='serviceLink copy' /></a>");
  copyElem.on("click", function() {
    openCopyToClipboardOptions(data);
  })
  element.append(copyElem);
}

function recurseCreateList(data, elements) {
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
          htmlRetStr += recurseCreateList(data[key], elements);
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

/**
 * Find the value to the corresponding key in a JSON-Object.
 * @param {JSON} data 
 * @param {string} key 
 */
function recurseGetValue(data, key) {
  var value = "";

  for (var prop in data) {
    if(prop === key) {
      if (typeof (data[prop]) == 'object' && data[prop] != null) {
        if (data[prop].name)
          value = data[prop].name;
        else if (data[prop].length !== "NaN") {
          var arr = data[prop];
          for (var elem in arr) {
            value += arr[elem].name;
            if (parseInt(elem) + 1 < arr.length)
              value += ", ";
          }
        } else {
          recurseGetValue(data[prop], elements);
        }
      } else {
        value = data[prop];
      }

      return value;
    }
  }
  return null;
}

// appends an audio element to playback and download recording
function createAudioElement(blobUrl, parent) {
  const downloadEl = document.createElement('a');
  downloadEl.style = 'display: block';
  //downloadEl.innerHTML = 'download';
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

/**
 * data-json like this:
 *  {
 *    "timestamp": "01.01.2019 12:00:00",
 *    "status": "success|failed",
 *    "message": "...",
 *    "result": {
 *        ...
 *     },
 *    "blob": "base64 String or null"
 *  }
 * @param {*} data 
 */
function addToHistory(data) {

  var historyEntries = getHistory();

  // keep a maximum of 30 entries, remove oldest (last) entry
  if(historyEntries.length >= 30) {
    historyEntries.pop();
  }

  // add new element at the beginning
  historyEntries.unshift(data);

  //write history back to local storage
  localStorage.setItem("recognitionHistory", JSON.stringify(historyEntries));
}

function getHistory() {
  var historyEntries = localStorage.getItem("recognitionHistory");
  if(JSON.parse(historyEntries)) {
    return JSON.parse(historyEntries);
  } else {
    return [];
  }
}

function prepareHistoryList() {
  var accordionDiv = $("#jqAccordion");
  accordionDiv.empty();
  var counter = 0;

  $.each(getHistory(), function(idx, entry) {
    // header
    var header = $("<h1 class='accordionEntryHeader "+entry.status+"'></h1>");
    header.append("<div><span class='timestamp'>"+entry.timestamp+"</span><br>"+entry.message+"</div>");
    accordionDiv.append(header);
    
    // body with positive result
    if(entry.result) {
      let body = $("<div class='accordionEntryBody'></div>");
      let links = $("<div style='margin-left: 0.5rem;'></div>");
      processExternalMetadata(entry.result, links);
      body.append(recurseCreateList(entry.result, resultProperties));
      body.append(links);
      accordionDiv.append(body);
    }
    // no result - adds the possibiliy to re-execute the recognition
    else if(entry.blob) {
      let body = $("<div class='accordionEntryBody'></div>");
      // var bodyContainer = $("<div class='bodyContainer'></div>");
      createAudioElement(entry.blob, body);

      if(entry.status === "failed") {
        var refresh = $("<div class='inlineButton'><div class='refresh'></div></div>");
        refresh.on("click", function() {
          accordionDiv.empty();
          accordionDiv.addClass('spinner');

          let blob = dataURItoBlob(entry.blob);
          identify(blob, blob.size, getConfig(), function(result, xhr, originalBlob) {
            
            // only do update the entry, if the request was successful
            if (xhr.status === 200 && result.status) {
              accordionDiv.removeClass('spinner');

              let resultObject = {"timestamp": entry.timestamp, "result": null, "message": "", "status": ""};
              let data = result.status;
              
              if (data["code"] === 0) {
                var dataList = result.metadata.music[0];
                resultObject.result = dataList;
                resultObject.status = "success";
                resultObject.message = dataList.artists[0].name +" - "+ dataList.title;
              } else {
                resultObject.message = result.status.msg;
                resultObject.status = "success";
              }

              var history = getHistory();
              // replace data of this entry
              history.splice(idx, 1, resultObject);
              localStorage.setItem("recognitionHistory", JSON.stringify(history));
              // reload history
              prepareHistoryList();
            } else {
              setTimeout(() => {
                accordionDiv.removeClass('spinner');
                prepareHistoryList();
              }, 1000);
            }
          });
          
        });
        body.append(refresh);
      }
      accordionDiv.append(body);
    } else {
      accordionDiv.append("<div class='accordionEntryBody'></div>");
    }

    counter++;
  });

  accordionDiv.accordion("refresh");
}

function dataURItoBlob(dataURI) {
  // convert base64 to raw binary data held in a string
  // doesn't handle URLEncoded DataURIs - see SO answer #6850276 for code that does this
  var byteString = atob(dataURI.split(',')[1]);

  // separate out the mime component
  var mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0]

  // write the bytes of the string to an ArrayBuffer
  var ab = new ArrayBuffer(byteString.length);

  // create a view into the buffer
  var ia = new Uint8Array(ab);

  // set the bytes of the buffer to the correct values
  for (var i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
  }

  // write the ArrayBuffer to a blob, and you're done
  var blob = new Blob([ab], {type: mimeString});
  return blob;

}

function openCopyToClipboardOptions(data) {
  UI.pagestack.push("copyToClipboard");

  var copyArtist = $("#copyArtist");
  var copyTitle = $("#copyTitle");
  var copyArtistTitle = $("#copyArtistTitle");
  var copyAll = $("#copyAll");

  copyArtist.unbind("click");
  copyTitle.unbind("click");
  copyArtistTitle.unbind("click");
  copyAll.unbind("click");

  copyArtist.on("click", function(event) {
    let value = recurseGetValue(data, "artists");
    copyTextToClipboard(value);
    $(this).unbind(event);
    UI.pagestack.pop("copyToClipboard");
  });

  copyTitle.on("click", function(event) {
    let value = recurseGetValue(data, "title");
    copyTextToClipboard(value);
    $(this).unbind(event);
    UI.pagestack.pop("copyToClipboard");
  });

  copyArtistTitle.on("click", function(event) {
    let value1 = recurseGetValue(data, "artists");
    let value2 = recurseGetValue(data, "title");
    copyTextToClipboard(value1 +" - "+ value2);
    $(this).unbind(event);
    UI.pagestack.pop("copyToClipboard");
  });

  copyAll.on("click", function(event) {
    let values = "";

    resultProperties.forEach(prop => {
      let value = recurseGetValue(data, prop);
      if(value) values += "\n" + capitalizeFirstLetter(prop) +": "+ value;
    });
    copyTextToClipboard(values);
    $(this).unbind(event);
    UI.pagestack.pop("copyToClipboard");
  });
}

function copyTextToClipboard(str) {
  const el = document.createElement('textarea');
  el.value = str;
  el.setAttribute('readonly', '');
  el.style.position = 'absolute';
  el.style.left = '-9999px';
  document.body.appendChild(el);
  el.select();
  document.execCommand('copy');
  document.body.removeChild(el);
}