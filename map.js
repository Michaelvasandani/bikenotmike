import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";
import mapboxgl from "https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm";

console.log("Mapbox GL JS Loaded:", mapboxgl);

// Set your Mapbox access token
mapboxgl.accessToken =
  "pk.eyJ1IjoibXZhc2FuZGFuaSIsImEiOiJjbTdsZnB5cjQwYXMwMmtwdHdqYjk5NTF2In0.vVlI8n7lTEmIwD4O3ysMUQ";

// ✅ Format minutes into HH:MM AM/PM format
function formatTime(minutes) {
  const date = new Date(0, 0, 0, 0, minutes);
  return date.toLocaleString("en-US", { timeStyle: "short" });
}

// ✅ Function to calculate minutes since midnight
function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

// ✅ Function to filter trips based on time
function filterTripsbyTime(trips, timeFilter) {
  return timeFilter === -1 
    ? trips // If no filter is applied (-1), return all trips
    : trips.filter((trip) => {
        // Convert trip start and end times to minutes since midnight
        const startedMinutes = minutesSinceMidnight(trip.started_at);
        const endedMinutes = minutesSinceMidnight(trip.ended_at);
        
        // Include trips that started or ended within 60 minutes of the selected time
        return (
          Math.abs(startedMinutes - timeFilter) <= 60 ||
          Math.abs(endedMinutes - timeFilter) <= 60
        );
    });
}

// ✅ Function to compute station traffic
function computeStationTraffic(stations, trips) {
  // Compute departures
  const departures = d3.rollup(
    trips, 
    (v) => v.length, 
    (d) => d.start_station_id
  );

  // Compute arrivals
  const arrivals = d3.rollup(
    trips,
    (v) => v.length,
    (d) => d.end_station_id
  );

  // Update each station with traffic data
  return stations.map((station) => {
    let id = station.short_name;
    station.arrivals = arrivals.get(id) ?? 0;
    station.departures = departures.get(id) ?? 0;
    station.totalTraffic = station.arrivals + station.departures;
    return station;
  });
}

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

  // ✅ Select slider and display elements
  const timeSlider = document.getElementById("time-slider");
  const selectedTime = document.getElementById("selected-time");
  const anyTimeLabel = document.getElementById("any-time");

  // ✅ Select the SVG inside #map
  const svg = d3.select("#map").select("svg");

  // ✅ Create a floating tooltip element
  const tooltip = d3
    .select("body")
    .append("div")
    .attr("class", "tooltip")
    .style("position", "absolute")
    .style("background", "white")
    .style("padding", "5px")
    .style("border-radius", "5px")
    .style("border", "1px solid black")
    .style("box-shadow", "2px 2px 5px rgba(0,0,0,0.3)")
    .style("visibility", "hidden")
    .style("font-size", "12px")
    .style("z-index", "1000");

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

  // ✅ Add Boston and Cambridge bike lanes
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

  // ✅ Load Bluebikes station and traffic data
  const stationUrl =
    "https://dsc106.com/labs/lab07/data/bluebikes-stations.json";
  const trafficUrl =
    "https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv";

  let jsonData, trips;
  try {
    jsonData = await d3.json(stationUrl);
    
    // ✅ Parse date strings to Date objects on load
    trips = await d3.csv(
      trafficUrl,
      (trip) => {
        trip.started_at = new Date(trip.started_at);
        trip.ended_at = new Date(trip.ended_at);
        return trip;
      }
    );
    
    console.log("Loaded Stations and Traffic Data:", jsonData, trips);
  } catch (error) {
    console.error("Error loading data:", error);
    return;
  }

  // ✅ Filter stations with valid coordinates
  let validStations = jsonData.data.stations.filter(
    (d) => d.lon && d.lat && !isNaN(d.lon) && !isNaN(d.lat)
  );

  // ✅ Compute station traffic using our new function
  let stations = computeStationTraffic(validStations, trips);

  // ✅ Define a square root scale for circle size
  const radiusScale = d3
    .scaleSqrt()
    .domain([0, d3.max(stations, (d) => d.totalTraffic)])
    .range([0, 25]);

  // ✅ Append circles for each valid station (with key function)
  const circles = svg
    .selectAll("circle")
    .data(stations, (d) => d.short_name) // Using station short_name as key
    .enter()
    .append("circle")
    .attr("r", (d) => radiusScale(d.totalTraffic))
    .attr("fill", "steelblue")
    .attr("stroke", "white")
    .attr("stroke-width", 1)
    .attr("fill-opacity", 0.6)
    .attr("pointer-events", "auto")
    .on("mouseover", function (event, d) {
      tooltip
        .style("visibility", "visible")
        .html(
          `<strong>${d.totalTraffic} trips</strong><br>(${d.departures} departures, ${d.arrivals} arrivals)`
        );
    })
    .on("mousemove", function (event) {
      tooltip
        .style("top", `${event.pageY - 30}px`)
        .style("left", `${event.pageX + 15}px`);
    })
    .on("mouseout", function () {
      tooltip.style("visibility", "hidden");
    });

  // ✅ Function to update circle positions
  function updatePositions() {
    circles
      .attr("cx", (d) => getCoords(d).cx)
      .attr("cy", (d) => getCoords(d).cy);
  }

  // ✅ Function to update scatter plot based on time filter
  function updateScatterPlot(timeFilter) {
    // Get only the trips that match the selected time filter
    const filteredTrips = filterTripsbyTime(trips, timeFilter);
    
    // Recompute station traffic based on the filtered trips
    const filteredStations = computeStationTraffic(validStations, filteredTrips);
    
    // Adjust radius scale based on filtering
    timeFilter === -1 
      ? radiusScale.range([0, 25]) 
      : radiusScale.range([3, 50]);
    
    // Update the scatterplot by adjusting the radius of circles
    circles
      .data(filteredStations, (d) => d.short_name) // Use station short_name as key
      .join('circle') // Ensure the data is bound correctly
      .attr('r', (d) => radiusScale(d.totalTraffic)); // Update circle sizes
  }

  // ✅ Function to update displayed time and filter value
  function updateTimeDisplay() {
    let timeFilter = Number(timeSlider.value); // Get slider value

    if (timeFilter === -1) {
      selectedTime.textContent = ""; // Clear time display
      anyTimeLabel.style.display = "block"; // Show "(any time)"
    } else {
      selectedTime.textContent = formatTime(timeFilter); // Display formatted time
      anyTimeLabel.style.display = "none"; // Hide "(any time)"
    }

    // Call updateScatterPlot to reflect the changes on the map
    updateScatterPlot(timeFilter);
  }

  // ✅ Listen for slider input and update the UI
  timeSlider.addEventListener("input", updateTimeDisplay);

  // ✅ Initial position update
  updatePositions();
  
  // ✅ Initialize the UI on page load
  updateTimeDisplay();

  // ✅ Update positions on map movements
  map.on("move", updatePositions);
  map.on("zoom", updatePositions);
  map.on("resize", updatePositions);
  map.on("moveend", updatePositions);
});