/** Self-contained Leaflet + OpenStreetMap page used by the location picker (free, no API key). */
export function buildMapHtml(lat: number, lng: number, zoom: number): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>html,body,#map{height:100%;margin:0;background:#e5e7eb}</style></head>
<body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var map=L.map('map',{zoomControl:true}).setView([${lat},${lng}],${zoom});
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map);
var marker=L.marker([${lat},${lng}],{draggable:true}).addTo(map);
function send(){var p=marker.getLatLng();var m=JSON.stringify({lat:p.lat,lng:p.lng});
  if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(m);}else{parent.postMessage(m,'*');}}
map.on('click',function(e){marker.setLatLng(e.latlng);send();});
marker.on('dragend',send);
function onMsg(e){try{var d=JSON.parse(e.data);if(d&&d.move){var ll=L.latLng(d.lat,d.lng);marker.setLatLng(ll);map.setView(ll,17);send();}}catch(_){}}
window.addEventListener('message',onMsg);
document.addEventListener('message',onMsg);
send();
</script></body></html>`;
}
