import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// 创建地图，设置中心位置为 Cork 城中心
const map = L.map('map').setView([51.899, -8.47], 14);

// 添加 OpenStreetMap 瓦片图层
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// 自定义图标
const otterIcon = L.icon({
  iconUrl: '/assets/images/icon.png', // 确保路径正确，文件名为 icon.png
  iconSize: [40, 40], // 图标尺寸（可根据实际图片微调）
  iconAnchor: [20, 40], // 图标锚点（底部中心）
  popupAnchor: [0, -35] // 弹窗相对于图标的偏移
});

// 加载 Lee River 的 GeoJSON 数据并显示高亮样式
fetch('/assets/geo/lee-river.geojson')
  .then(res => res.json())
  .then(data => {
    L.geoJSON(data, {
      style: {
        color: '#3399ff',
        weight: 5,
        opacity: 0.9,
        className: 'river-path'
      }
    }).addTo(map);
  })
  .catch(err => {
    console.error('Failed to load river GeoJSON:', err);
  });

// 添加图钉（使用自定义图标）：
L.marker([51.89830, -8.49079], { icon: otterIcon })
  .addTo(map)
  .bindPopup('<b>Node 1:</b> Blackpool Headwaters')
  .on('click', () => window.location.href = '/node1.html');

L.marker([51.898920, -8.483751], { icon: otterIcon })
  .addTo(map)
  .bindPopup('<b>Node 2:</b> Path Choose')
  .on('click', () => window.location.href = '/node2.html');

L.marker([51.901414, -8.477903], { icon: otterIcon })
  .addTo(map)
  .bindPopup('<b>Node 3:</b> Feeding Scene')
  .on('click', () => window.location.href = '/node3.html');

L.marker([51.900676, -8.470667], { icon: otterIcon })
  .addTo(map)
  .bindPopup('<b>Node 4:</b> Path Choose')
  .on('click', () => window.location.href = '/node4.html');

L.marker([51.900199, -8.465996], { icon: otterIcon })
  .addTo(map)
  .bindPopup('<b>Node 5:</b> Path Choose')
  .on('click', () => window.location.href = '/node5.html');

L.marker([51.899299, -8.459837], { icon: otterIcon })
  .addTo(map)
  .bindPopup('<b>Node 6:</b> Path Choose')
  .on('click', () => window.location.href = '/node6.html');