function buildStringToSign(method, uri, accessKey, dataType, signatureVersion, timestamp) {
  return [method, uri, accessKey, dataType, signatureVersion, timestamp].join('\n');
}

function sign(signString, accessSecret) {
  var stringInUTF8 = CryptoJS.enc.Utf8.parse(signString);
  var hash = CryptoJS.HmacSHA1(stringInUTF8, accessSecret);
  var hashInBase64 = CryptoJS.enc.Base64.stringify(hash);
  return hashInBase64;
}

/**
 * Identifies a sample of bytes
 */
function identify(data, length, options, callback) {

  if (!Date.now) {
    Date.now = function() { return new Date().getTime(); }
  }
  
  var timestamp = Date.now();

  var stringToSign = buildStringToSign('POST',
  options.endpoint,
  options.access_key,
  options.data_type,
  options.signature_version,
  timestamp);

  //console.debug(stringToSign);

  var signature = sign(stringToSign, options.access_secret);

  var formData = new FormData();
  formData.append("sample", data);
  formData.append("access_key", options.access_key);
  formData.append("data_type", options.data_type);
  formData.append("signature_version", options.signature_version);
  formData.append("signature", signature);
  formData.append("sample_bytes", length);
  formData.append("timestamp", timestamp);
  //formData.append("audio_format", options.audio_format);
  console.debug("SAMPLE BYTES: " + data.size);

  $.ajax({
    url: 'http://'+options.host + options.endpoint,
    method: 'POST',
    timeout: 20000,
    data: formData,
    contentType: false,
    processData :false
  }).done(function(result, textStatus, jqXHR){
    callback(JSON.parse(result), jqXHR, data);
  }).fail(function(jqXHR, textStatus, errorThrown){
    callback(errorThrown, jqXHR, data);
  });
}