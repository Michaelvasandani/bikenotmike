import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";
import mapboxgl from "https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm";

console.log("Mapbox GL JS Loaded:", mapboxgl);

// Set your Mapbox access token
mapboxgl.accessToken =
  "pk.eyJ1IjoibXZhc2FuZGFuaSIsImEiOiJjbTdsZnB5cjQwYXMwMmtwdHdqYjk5NTF2In0.vVlI8n7lTEmIwD4O3ysMUQ";

// Initialize the map
const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/streets-v12",
  center: [-71.09415, 42.36027], // Boston/Cambridge
  zoom: 12,
  minZoom: 5,
  maxZoom: 18,
});

map.on("load", async () => {
  console.log("Map has loaded");

  // Select the SVG inside #map
  const svg = d3.select("#map").select("svg");

  // ✅ Helper function: Convert longitude & latitude to pixel coordinates
  function getCoords(station) {
    if (
      !station.lon ||
      !station.lat ||
      isNaN(station.lon) ||
      isNaN(station.lat)
    ) {
      console.warn("Skipping invalid station:", station);
      return { cx: -100, cy: -100 }; // Offscreen to avoid errors
    }
    const point = new mapboxgl.LngLat(+station.lon, +station.lat);
    const { x, y } = map.project(point);
    return { cx: x, cy: y };
  }

  // ✅ Add Boston bike lanes
  map.addSource("boston_route", {
    type: "geojson",
    data: "https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson",
  });

  map.addLayer({
    id: "bike-lanes-boston",
    type: "line",
    source: "boston_route",
    paint: {
      "line-color": "#32D400",
      "line-width": 3,
      "line-opacity": 0.6,
    },
  });

  // ✅ Add Cambridge bike lanes
  map.addSource("cambridge_route", {
    type: "geojson",
    data: "https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson",
  });

  map.addLayer({
    id: "bike-lanes-cambridge",
    type: "line",
    source: "cambridge_route",
    paint: {
      "line-color": "#FF0000",
      "line-width": 3,
      "line-opacity": 0.6,
    },
  });

  console.log("Boston and Cambridge bike lanes added to the map");

  // ✅ Load Bluebikes station data
  const stationUrl =
    "https://dsc106.com/labs/lab07/data/bluebikes-stations.json";

  let jsonData;
  try {
    jsonData = await d3.json(stationUrl);
    console.log("Loaded JSON Data:", jsonData);
  } catch (error) {
    console.error("Error loading station data:", error);
    return;
  }

  if (!jsonData || !jsonData.data || !jsonData.data.stations) {
    console.error(
      "Error: JSON structure is incorrect or missing 'data.stations'"
    );
    return;
  }

  // ✅ Filter out stations with missing or invalid coordinates
  let stations = jsonData.data.stations.filter(
    (d) => d.lon && d.lat && !isNaN(d.lon) && !isNaN(d.lat)
  );
  console.log("Valid Stations:", stations.length);

  // ✅ Load Bluebikes traffic data
  const trafficUrl =
    "https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv";

  let trips;
  try {
    trips = await d3.csv(trafficUrl);
    console.log("Loaded Traffic Data:", trips);
  } catch (error) {
    console.error("Error loading traffic data:", error);
    return;
  }

  console.log("First Trip Record:", trips[0]); // Debugging to check CSV structure

  // ✅ Calculate departures
  const departures = d3.rollup(
    trips,
    (v) => v.length,
    (d) => d.start_station_id
  );

  // ✅ Calculate arrivals
  const arrivals = d3.rollup(
    trips,
    (v) => v.length,
    (d) => d.end_station_id
  );

  // ✅ Assign traffic data to stations
  stations = stations.map((station) => {
    let id = station.short_name;
    station.arrivals = arrivals.get(id) ?? 0;
    station.departures = departures.get(id) ?? 0;
    station.totalTraffic = station.arrivals + station.departures;
    return station;
  });

  console.log("Updated Stations with Traffic Data:", stations);

  // ✅ Append circles for each valid station
  const circles = svg
    .selectAll("circle")
    .data(stations)
    .enter()
    .append("circle")
    .attr("r", 5) // Circle size
    .attr("fill", "steelblue") // Fill color
    .attr("stroke", "white") // Border color
    .attr("stroke-width", 1) // Border thickness
    .attr("opacity", 0.8); // Transparency

  // ✅ Function to update circle positions
  function updatePositions() {
    circles
      .attr("cx", (d) => getCoords(d).cx)
      .attr("cy", (d) => getCoords(d).cy);
  }

  // ✅ Initial position update
  updatePositions();

  // ✅ Update positions on map movements
  map.on("move", updatePositions);
  map.on("zoom", updatePositions);
  map.on("resize", updatePositions);
  map.on("moveend", updatePositions);
});
