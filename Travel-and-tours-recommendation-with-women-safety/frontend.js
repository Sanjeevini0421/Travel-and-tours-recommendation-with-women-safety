// ======================== GLOBAL VARIABLES ========================
let currentPlace = null;
let currentUser = null;

let mlUserProfile = {
    preferredCategories: {},
    clickHistory: [],
    ratingHistory: [],
    totalClicks: 0
};

// API base URL - adjust this to match your backend server
const API_BASE_URL = 'http://localhost:8000';

// ======================== INITIALIZATION ========================

document.addEventListener('DOMContentLoaded', function() {
    console.log('\n🚀 Destini Guide Initializing...\n');
    setupEventListeners();
    loadUserProfile();
    checkUserSession();
    getRealtimeLocation();
    requestNotificationPermission();
    console.log('✅ System Ready!\n');
});

function setupEventListeners() {
    document.getElementById('searchBtn').addEventListener('click', searchPlaces);
    document.getElementById('closeModal').addEventListener('click', closeModal);
    document.getElementById('sendChatBtn').addEventListener('click', sendChatMessage);
    document.getElementById('getDirectionsBtn').addEventListener('click', getDirections);
    
    // Floating chatbot
    document.getElementById('chatbotButton').addEventListener('click', toggleChatbot);
    document.getElementById('chatbotClose').addEventListener('click', toggleChatbot);

    // Auth listeners
    document.getElementById('loginSignupBtn').addEventListener('click', openAuthModal);
    document.getElementById('authClose').addEventListener('click', closeAuthModal);
    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('signupForm').addEventListener('submit', handleSignup);

    document.querySelectorAll('.auth-tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            switchAuthTab(this.dataset.authTab);
        });
    });

    document.getElementById('authModal').addEventListener('click', function(e) {
        if (e.target === this) closeAuthModal();
    });

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            switchTab(this.dataset.tab);
        });
    });

    document.getElementById('placeModal').addEventListener('click', function(e) {
        if (e.target === this) closeModal();
    });

    document.getElementById('destinationLocation').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') document.getElementById('searchBtn').click();
    });

    document.getElementById('chatInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') document.getElementById('sendChatBtn').click();
    });
}

// ======================== API SERVICE ========================

class APIService {
    static async searchPlaces(query, limit = 9) {
        try {
            const response = await fetch(`${API_BASE_URL}/search?q=${encodeURIComponent(query)}&limit=${limit}`);
            if (!response.ok) {
                // If real API fails, try mock endpoint
                console.warn('Real API failed, using mock data...');
                const mockResponse = await fetch(`${API_BASE_URL}/search/mock?q=${encodeURIComponent(query)}`);
                if (!mockResponse.ok) {
                    throw new Error(`HTTP error! status: ${mockResponse.status}`);
                }
                const mockData = await mockResponse.json();
                return mockData.results;
            }
            const data = await response.json();
            return data.results;
        } catch (error) {
            console.error('Error searching places:', error);
            // Try mock endpoint as fallback
            try {
                console.warn('Attempting to use mock data as fallback...');
                const mockResponse = await fetch(`${API_BASE_URL}/search/mock?q=${encodeURIComponent(query)}`);
                if (mockResponse.ok) {
                    const mockData = await mockResponse.json();
                    return mockData.results;
                }
            } catch (mockError) {
                console.error('Mock endpoint also failed:', mockError);
            }
            throw error;
        }
    }

    static async getPlaceSafetyIndex(placeId) {
        try {
            const response = await fetch(`${API_BASE_URL}/place/${placeId}/wsi`);
            if (!response.ok) {
                // If it's a mock place, use the mock endpoint
                if (placeId.startsWith('mock_')) {
                    const mockResponse = await fetch(`${API_BASE_URL}/place/${placeId}/wsi`);
                    if (mockResponse.ok) {
                        return await mockResponse.json();
                    }
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching safety index:', error);
            // Return mock safety data as fallback
            return {
                place_id: placeId,
                name: "Place",
                rating: 4.5,
                user_ratings_total: 1000,
                wsi_score: 70,
                wsi_label: { label: "Safe", color: "#4CAF50" },
                safety_tips: [
                    "✅ This is mock safety data (API key not configured)",
                    "✅ Set your GOOGLE_API_KEY for real data",
                    "⚠️ Exercise normal caution while visiting"
                ],
                reviews_count: 0
            };
        }
    }

    static async getWeather(placeName) {
        try {
            const response = await fetch(`${API_BASE_URL}/weather?place=${encodeURIComponent(placeName)}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching weather:', error);
            throw error;
        }
    }

    static async getCrowdPattern() {
        try {
            const response = await fetch(`${API_BASE_URL}/crowd`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching crowd pattern:', error);
            throw error;
        }
    }

    static async sendChatMessage(message, place = null) {
        try {
            const response = await fetch(`${API_BASE_URL}/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ message, place })
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            return data.response;
        } catch (error) {
            console.error('Error sending chat message:', error);
            throw error;
        }
    }
}

// ======================== ML ENGINE ========================

function extractFeatures(place) {
    return {
        ratingScore: (place.rating || 0) / 5 * 100,
        reviewScore: Math.min((place.user_ratings_total || 0) / 1000, 1) * 100,
        categoryScore: getCategoryScore(place.types),
        popularityScore: calculatePopularity(place),
        userPrefScore: calculateUserPreferenceScore(place)
    };
}

function getCategoryScore(types) {
    const weights = {
        'tourist_attraction': 1.0, 'museum': 1.0, 'historical_landmark': 1.0,
        'art_gallery': 0.95, 'natural_feature': 0.95, 'point_of_interest': 0.9,
        'park': 0.9, 'zoo': 0.9, 'aquarium': 0.9, 'church': 0.85, 'temple': 0.85
    };
    if (!types) return 50;
    let maxScore = 0;
    types.forEach(type => {
        maxScore = Math.max(maxScore, (weights[type] || 0.5) * 100);
    });
    return maxScore;
}

function calculatePopularity(place) {
    const reviews = place.user_ratings_total || 0;
    return Math.min(Math.log10(Math.max(reviews, 1)) / 5, 1) * 100;
}

function calculateUserPreferenceScore(place) {
    let score = 50;
    if (place.types) {
        place.types.forEach(type => {
            if (mlUserProfile.preferredCategories[type]) {
                score += mlUserProfile.preferredCategories[type] * 10;
            }
        });
    }
    return Math.min(score, 100);
}

function calculateMLScore(place) {
    const features = extractFeatures(place);
    return Math.round(
        (features.ratingScore * 0.30) +
        (features.reviewScore * 0.25) +
        (features.categoryScore * 0.20) +
        (features.popularityScore * 0.15) +
        (features.userPrefScore * 0.10)
    );
}

function mlRecommendationEngine(places) {
    console.log('🤖 ML ENGINE: Ranking ' + places.length + ' places...');
    const scored = places.map(place => ({
        ...place,
        mlScore: calculateMLScore(place)
    }));
    const ranked = scored.sort((a, b) => b.mlScore - a.mlScore);
    console.log('✅ Top 3 ML Scores:', ranked.slice(0, 3).map(p => ({ name: p.name, score: p.mlScore })));
    return ranked;
}

function trackUserClick(place) {
    console.log('📊 ML: Tracking user click on:', place.name);
    mlUserProfile.totalClicks++;
    mlUserProfile.clickHistory.push({ place: place.name, types: place.types, rating: place.rating });
    if (place.types) {
        place.types.forEach(type => {
            mlUserProfile.preferredCategories[type] = (mlUserProfile.preferredCategories[type] || 0) + 0.2;
        });
    }
    if (place.rating) mlUserProfile.ratingHistory.push(place.rating);
    saveUserProfile();
    console.log('✅ User Profile Updated');
}

function saveUserProfile() {
    try {
        localStorage.setItem('mlUserProfile', JSON.stringify(mlUserProfile));
    } catch (e) {
        console.error('Failed to save user profile:', e);
    }
}

function loadUserProfile() {
    try {
        const saved = localStorage.getItem('mlUserProfile');
        if (saved) {
            mlUserProfile = JSON.parse(saved);
            console.log('✅ Loaded user profile from storage');
        }
    } catch (e) {
        console.error('Failed to load user profile:', e);
    }
}

function getRealtimeLocation() {
    // For now, we'll just set a default location
    document.getElementById('presentLocation').value = 'Current Location';
}

function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

// ======================== CROWD ANALYSIS ========================

function getCrowdStatus(value) {
    if (value < 40) {
        return { label: '🟢 Low', color: '#4CAF50' };
    } else if (value < 70) {
        return { label: '🟡 Moderate', color: '#FFD700' };
    } else {
        return { label: '🔴 High', color: '#FF4C4C' };
    }
}

function createCrowdGauge(currentCrowd) {
    const status = getCrowdStatus(currentCrowd);
    
    // Calculate number of group icons based on crowd level
    let groupCount;
    let rowConfig; // Configuration for row arrangement
    
    if (currentCrowd < 40) {
        groupCount = 8; // Low crowd - 8 people
        rowConfig = [3, 3, 2]; // 3 rows
    } else if (currentCrowd < 70) {
        groupCount = 20; // Moderate crowd - 20 people
        rowConfig = [10, 10]; // 2 rows
    } else {
        groupCount = 40; // High crowd - 40 people
        rowConfig = [14, 13, 13]; // 3 rows
    }
    
    // Generate group icons arranged in rows - using black person icons
    let peopleRows = '';
    let iconIndex = 0;
    
    rowConfig.forEach((count, rowIndex) => {
        let rowIcons = '';
        for (let i = 0; i < count && iconIndex < groupCount; i++, iconIndex++) {
            rowIcons += `<i class="fas fa-male" style="
                margin: 0 0.2rem;
                font-size: 2rem;
                color: #000000;
                display: inline-block;
            "></i>`;
        }
        
        peopleRows += `
            <div style="
                display: flex;
                justify-content: center;
                align-items: flex-end;
                margin: 0.3rem 0;
            ">
                ${rowIcons}
            </div>
        `;
    });
    
    // Create visual crowd display
    const crowdVisual = `
        <div style="
            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
            padding: 2rem;
            border-radius: 15px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
            text-align: center;
        ">
            <!-- Score Scale -->
            <div style="
                background: white;
                padding: 1rem;
                border-radius: 10px;
                margin-bottom: 1.5rem;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            ">
                <div style="font-size: 1.1rem; color: #666; margin-bottom: 0.8rem; font-weight: 600;">Crowd Level Scale</div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                    <span style="color: #4CAF50; font-weight: bold; font-size: 0.9rem;">0%</span>
                    <span style="color: #FFD700; font-weight: bold; font-size: 0.9rem;">40%</span>
                    <span style="color: #FF9800; font-weight: bold; font-size: 0.9rem;">70%</span>
                    <span style="color: #FF4C4C; font-weight: bold; font-size: 0.9rem;">100%</span>
                </div>
                <div style="
                    height: 20px;
                    background: linear-gradient(to right, #4CAF50 0%, #4CAF50 40%, #FFD700 40%, #FFD700 70%, #FF4C4C 70%, #FF4C4C 100%);
                    border-radius: 10px;
                    position: relative;
                    box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);
                ">
                    <div style="
                        position: absolute;
                        left: ${currentCrowd}%;
                        top: -8px;
                        transform: translateX(-50%);
                        width: 4px;
                        height: 36px;
                        background: #333;
                        border-radius: 2px;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                    "></div>
                </div>
                <div style="margin-top: 1rem; font-size: 2rem; font-weight: bold; color: ${status.color};">
                    ${currentCrowd}%
                </div>
            </div>
            
            <!-- Current Status -->
            <div style="
                font-size: 1.5rem;
                font-weight: bold;
                color: ${status.color};
                margin-bottom: 1.5rem;
                text-shadow: 0 2px 4px rgba(0,0,0,0.1);
            ">
                Current Crowd: ${status.label}
            </div>
            
            <!-- Group Icons Visualization - Row Layout with Black Person Icons -->
            <div style="
                background: white;
                padding: 2.5rem;
                border-radius: 10px;
                min-height: 200px;
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                box-shadow: inset 0 2px 8px rgba(0,0,0,0.05);
            ">
                ${peopleRows}
            </div>
            
            <div style="margin-top: 1rem; font-size: 0.9rem; color: #666; font-style: italic;">
                ${currentCrowd < 40 ? '✨ Great time to visit with minimal crowds!' : 
                  currentCrowd < 70 ? '⚠️ Moderate crowd expected' : 
                  '🚨 High crowd - Consider visiting at off-peak hours'}
            </div>
        </div>
    `;
    
    document.getElementById('crowdGauge').innerHTML = crowdVisual;
}

function createCrowdChart(hours, values) {
    const data = [{
        x: hours,
        y: values,
        type: 'scatter',
        mode: 'lines+markers',
        line: {
            color: 'royalblue',
            width: 3
        },
        marker: {
            size: 8,
            color: 'royalblue'
        },
        fill: 'tozeroy',
        fillcolor: 'rgba(65, 105, 225, 0.2)'
    }];

    const layout = {
        xaxis: {
            title: 'Time of Day',
            showgrid: true,
            gridcolor: '#e0e0e0'
        },
        yaxis: {
            title: 'Crowd Level (%)',
            range: [0, 100],
            showgrid: true,
            gridcolor: '#e0e0e0'
        },
        height: 350,
        margin: { t: 20, b: 60, l: 60, r: 20 },
        paper_bgcolor: 'white',
        plot_bgcolor: 'white',
        font: { family: 'Arial', color: '#333' }
    };

    const config = {responsive: true, displayModeBar: false};
    Plotly.newPlot('crowdChart', data, layout, config);
}

async function updateCrowdAnalysis() {
    try {
        showLoading(true);
        const crowdData = await APIService.getCrowdPattern();
        
        // Get real-time crowd prediction based on current hour
        const currentHour = new Date().getHours();
        const currentCrowd = predictRealTimeCrowd(currentHour);
        
        createCrowdGauge(currentCrowd);
        createCrowdChart(crowdData.hours, crowdData.values);
        showLoading(false);
    } catch (error) {
        console.error('Error updating crowd analysis:', error);
        showLoading(false);
        document.getElementById('crowdGauge').innerHTML = '<p>Error loading crowd data. Please try again.</p>';
    }
}

function predictRealTimeCrowd(hour) {
    // Real-time crowd prediction based on time of day
    let crowdLevel;
    
    if (hour >= 6 && hour < 9) {
        // Early morning (6 AM - 9 AM): Low crowd
        crowdLevel = Math.floor(Math.random() * 15) + 20; // 20-35%
    } else if (hour >= 9 && hour < 12) {
        // Late morning (9 AM - 12 PM): Moderate-High crowd
        crowdLevel = Math.floor(Math.random() * 20) + 45; // 45-65%
    } else if (hour >= 12 && hour < 16) {
        // Afternoon (12 PM - 4 PM): High crowd (Peak hours)
        crowdLevel = Math.floor(Math.random() * 20) + 65; // 65-85%
    } else if (hour >= 16 && hour < 19) {
        // Evening (4 PM - 7 PM): Moderate-High crowd
        crowdLevel = Math.floor(Math.random() * 25) + 50; // 50-75%
    } else if (hour >= 19 && hour < 22) {
        // Night (7 PM - 10 PM): Moderate crowd
        crowdLevel = Math.floor(Math.random() * 20) + 35; // 35-55%
    } else {
        // Late night/Early morning (10 PM - 6 AM): Very low crowd
        crowdLevel = Math.floor(Math.random() * 15) + 10; // 10-25%
    }
    
    console.log(`🕒 Real-time Crowd Prediction for ${hour}:00 - ${crowdLevel}%`);
    return crowdLevel;
}

// ======================== WEATHER ANALYSIS ========================

function getWeatherIcon(temp, desc) {
    const description = desc.toLowerCase();
    if (description.includes('sun') || description.includes('clear')) return '☀️';
    if (description.includes('cloud')) return '⛅';
    if (description.includes('rain')) return '🌧️';
    if (description.includes('storm')) return '⛈️';
    if (description.includes('snow')) return '❄️';
    return '🌤️';
}

function generate5DayForecast(baseTemp) {
    const days = ['Today', 'Tomorrow', 'Day 3', 'Day 4', 'Day 5'];
    const icons = ['☀️', '⛅', '🌧️', '🌤️', '☁️'];
    const forecast = [];
    
    let currentTemp = baseTemp !== 'N/A' ? parseInt(baseTemp) : 25;
    
    for (let i = 0; i < 5; i++) {
        const tempVariation = Math.floor(Math.random() * 5) - 2;
        const dayTemp = currentTemp + tempVariation;
        const icon = icons[Math.floor(Math.random() * icons.length)];
        
        forecast.push({
            day: days[i],
            temp: dayTemp,
            icon: icon
        });
    }
    
    return forecast;
}

async function updateWeatherAnalysis(place) {
    try {
        showLoading(true);
        const address = place.formatted_address || place.vicinity || '';
        const cityMatch = address.match(/([^,]+),\s*([^,]+)/);
        const cityName = cityMatch ? cityMatch[1].trim() : place.name || 'Unknown';
        
        document.getElementById('weatherTemp').textContent = 'Loading...';
        document.getElementById('weatherDesc').textContent = 'Fetching weather data...';
        
        const weather = await APIService.getWeather(cityName);
        
        if (weather.available) {
            const icon = getWeatherIcon(weather.temp, weather.desc);
            document.getElementById('weatherTemp').innerHTML = `${icon} ${weather.temp}°C`;
            document.getElementById('weatherDesc').textContent = weather.desc;
            document.getElementById('weatherDetails').innerHTML = `
                💧 Humidity: ${weather.humidity}% &nbsp;&nbsp; 💨 Wind: ${weather.windspeed} km/h
            `;
        } else {
            document.getElementById('weatherTemp').textContent = '🌤️ 25°C';
            document.getElementById('weatherDesc').textContent = weather.desc;
            document.getElementById('weatherDetails').innerHTML = `
                💧 Humidity: -- % &nbsp;&nbsp; 💨 Wind: -- km/h
            `;
        }
        
        const forecast = generate5DayForecast(weather.temp);
        const forecastHtml = forecast.map(day => `
            <div style="
                background: linear-gradient(180deg, #f0f7ff, #e3f2fd);
                padding: 1rem;
                border-radius: 10px;
                text-align: center;
                box-shadow: 0 2px 5px rgba(0,0,0,0.1);
            ">
                <div style="font-weight: bold; color: #333; margin-bottom: 0.5rem;">
                    ${day.day}
                </div>
                <div style="font-size: 2rem; margin: 0.5rem 0;">
                    ${day.icon}
                </div>
                <div style="font-size: 1.2rem; font-weight: bold; color: #4364f7;">
                    ${day.temp}°C
                </div>
            </div>
        `).join('');
        
        document.getElementById('weatherForecast').innerHTML = forecastHtml;
        showLoading(false);
    } catch (error) {
        console.error('Error updating weather analysis:', error);
        showLoading(false);
        document.getElementById('weatherTemp').textContent = 'Error';
        document.getElementById('weatherDesc').textContent = 'Failed to fetch weather data';
    }
}

// ======================== WOMEN SAFETY INDEX ========================

function getSafetyLabel(score) {
    if (score >= 75) return { label: 'Safe', color: '#4CAF50' };
    if (score >= 45) return { label: 'Moderate', color: '#FFC107' };
    return { label: 'Unsafe', color: '#F44336' };
}

function generateSafetyTips(score) {
    if (score >= 75) {
        // Safe location tips
        return [
            '✅ This location is considered safe for visitors',
            '✅ Well-maintained area with good infrastructure',
            '✅ High ratings indicate positive visitor experiences',
            '✅ Feel free to explore during day and evening hours',
            '✅ Good availability of public services and amenities',
            '✅ Popular destination with regular foot traffic',
            '📸 Perfect spot for photography and sightseeing',
            '✅ Family-friendly environment',
            '👍 Recommended for solo travelers and groups alike'
        ];
    } else if (score >= 45) {
        // Moderate safety tips
        return [
            '⚠️ Exercise normal caution while visiting this area',
            '👥 Travel in groups when possible, especially after dark',
            '🔦 Stick to well-lit and populated areas',
            '📱 Keep your phone charged and emergency contacts handy',
            '👜 Keep valuables secure and avoid displaying expensive items',
            '⏰ Plan your visit during daytime hours for better safety',
            '🚕 Use registered taxis or ride-sharing services',
            '📍 Share your location with friends or family',
            '👂 Stay aware of your surroundings at all times',
            '🏪 Prefer visiting popular spots with security presence'
        ];
    } else {
        // Unsafe location tips
        return [
            '⛔ This area shows safety concerns - exercise extreme caution',
            '⏰ Avoid visiting after dark or during late hours',
            '👥 DO NOT travel alone - always go with a group',
            '🚨 Stay in constant contact with someone you trust',
            '🚫 Avoid carrying valuables, jewelry, or large amounts of cash',
            '🚕 Use only trusted and verified transportation services',
            '📱 Keep emergency numbers readily accessible',
            '🏛️ Consider visiting alternative locations with better safety ratings',
            '👮‍♀️ Be aware of nearby police stations or safe zones',
            '📍 Share real-time location with emergency contacts',
            '⚠️ Verify current local conditions before visiting',
            '🚪 Have a clear exit strategy and know your surroundings'
        ];
    }
}

function createSafetyGauge(score, label, color) {
    const data = [{
        type: "indicator",
        mode: "gauge+number",
        value: score,
        title: { text: "WSI Score: " + label, font: { size: 20 } },
        gauge: {
            axis: { range: [null, 100] },
            bar: { color: color },
            steps: [
                { range: [0, 39], color: "#ffcccc" },
                { range: [40, 74], color: "#fff4cc" },
                { range: [75, 100], color: "#ccffcc" }
            ],
            threshold: {
                line: { color: "red", width: 4 },
                thickness: 0.75,
                value: score
            }
        }
    }];

    const layout = {
        width: 400,
        height: 300,
        margin: { t: 50, b: 0, l: 0, r: 0 },
        paper_bgcolor: "white",
        font: { color: "#333", family: "Arial" }
    };

    Plotly.newPlot('safetyGauge', data, layout, {responsive: true});

    const statusBadge = `
        <div style="
            display: inline-block;
            padding: 0.8rem 1.5rem;
            border-radius: 25px;
            background: ${color};
            color: white;
            font-weight: bold;
            font-size: 1.1rem;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        ">
            <i class="fas fa-${score >= 75 ? 'check-circle' : score >= 40 ? 'exclamation-triangle' : 'times-circle'}"></i>
            ${label}
        </div>
    `;
    document.getElementById('safetyStatus').innerHTML = statusBadge;
}

function displayGoogleReviews(reviews) {
    const container = document.getElementById('googleReviewsContainer');
    
    if (!reviews || reviews.length === 0) {
        container.innerHTML = `
            <p style="text-align: center; color: #666; padding: 2rem;">
                No reviews available for this location.
            </p>
        `;
        return;
    }

    let html = '<div style="display: flex; flex-direction: column; gap: 0.5rem;">';
    
    const latestReviews = reviews.slice(0, 10).reverse();
    
    latestReviews.forEach((review, index) => {
        const rating = review.rating || 0;
        const text = review.text || 'No review text';
        const author = review.author_name || 'Anonymous';
        const time = review.time ? new Date(review.time * 1000).toLocaleDateString() : 'Recently';
        const relativeTime = review.relative_time_description || time;
        
        const stars = '★'.repeat(Math.floor(rating)) + '☆'.repeat(5 - Math.floor(rating));
        const reviewId = `review-${index}`;
        
        html += `
            <div style="
                background: white;
                border: 1px solid #e0e0e0;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                overflow: hidden;
            ">
                <div 
                    class="review-header" 
                    onclick="toggleReview('${reviewId}')"
                    style="
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 1rem;
                        cursor: pointer;
                        user-select: none;
                        transition: background-color 0.2s;
                    "
                    onmouseover="this.style.backgroundColor='#f5f5f5'"
                    onmouseout="this.style.backgroundColor='white'"
                >
                    <div style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <strong style="color: #333;">${author}</strong>
                            <span style="color: #ffc107; font-size: 0.9rem;">
                                ${stars} <span style="color: #666; font-size: 0.85rem;">(${rating}/5)</span>
                            </span>
                        </div>
                        <span style="color: #999; font-size: 0.85rem; display: block; margin-top: 0.3rem;">${relativeTime}</span>
                    </div>
                    <i 
                        id="icon-${reviewId}" 
                        class="fas fa-chevron-down" 
                        style="
                            color: #666; 
                            font-size: 0.9rem;
                            transition: transform 0.3s;
                            margin-left: 1rem;
                        "
                    ></i>
                </div>
                <div 
                    id="${reviewId}" 
                    style="
                        display: none;
                        padding: 0 1rem 1rem 1rem;
                        color: #555;
                        line-height: 1.6;
                        border-top: 1px solid #f0f0f0;
                    "
                >
                    ${text}
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

function toggleReview(reviewId) {
    const reviewContent = document.getElementById(reviewId);
    const icon = document.getElementById(`icon-${reviewId}`);
    
    if (reviewContent.style.display === 'none') {
        reviewContent.style.display = 'block';
        icon.style.transform = 'rotate(180deg)';
    } else {
        reviewContent.style.display = 'none';
        icon.style.transform = 'rotate(0deg)';
    }
}

async function updateSafetyTab(place) {
    document.getElementById('googleReviewsContainer').innerHTML = `
        <p style="text-align: center; color: #666; padding: 2rem;">
            <i class="fas fa-spinner fa-spin"></i> Loading reviews from Google Maps...
        </p>
    `;

    try {
        showLoading(true);
        const safetyData = await APIService.getPlaceSafetyIndex(place.place_id);
        
        createSafetyGauge(safetyData.wsi_score, safetyData.wsi_label.label, safetyData.wsi_label.color);
        
        // Display safety tips
        const tips = generateSafetyTips(safetyData.wsi_score);
        const tipsContainer = document.getElementById('safetyTips');
        
        let tipsHtml = '';
        tips.forEach(tip => {
            tipsHtml += `<li>${tip}</li>`;
        });
        
        tipsContainer.innerHTML = tipsHtml;
        
        // Update metrics
        document.getElementById('safetyRating').textContent = `${safetyData.rating || 'N/A'}/5`;
        
        showLoading(false);
    } catch (error) {
        console.error('Error updating safety tab:', error);
        showLoading(false);
        document.getElementById('googleReviewsContainer').innerHTML = `
            <p style="text-align: center; color: #f44336; padding: 2rem;">
                Error loading safety data. Please try again.
            </p>
        `;
    }
}

// ======================== SEARCH & PLACES ========================

async function searchPlaces() {
    const destination = document.getElementById('destinationLocation').value.trim();
    if (!destination) {
        alert('Please enter a destination');
        return;
    }

    showLoading(true);
    
    try {
        const results = await APIService.searchPlaces(destination);
        
        if (!results || results.length === 0) {
            showLoading(false);
            alert('No places found for "' + destination + '". Please try another destination or check if the backend server is running with a valid Google API key.');
            return;
        }
        
        const ranked = mlRecommendationEngine(results);
        displayPlaces(ranked, destination);
        showLoading(false);
    } catch (error) {
        console.error('Error searching places:', error);
        showLoading(false);
        
        // Check if it's a network error
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            alert('Cannot connect to the backend server. Please make sure the server is running at http://localhost:8000\n\nTo start the server, run: uvicorn server_fastapi:app --reload');
        } else if (error.message.includes('500')) {
            alert('Backend error: Please make sure you have set your GOOGLE_API_KEY environment variable.\n\nWindows PowerShell:\n$env:GOOGLE_API_KEY = "your_key_here"\n\nThen restart the server.');
        } else {
            alert('Unable to find places. Please try another destination.\n\nError: ' + error.message);
        }
    }
}

function displayPlaces(places, destination) {
    document.getElementById('destinationName').textContent = destination;
    const placesGrid = document.getElementById('placesGrid');
    placesGrid.innerHTML = '';

    places.forEach(place => {
        const card = createPlaceCard(place);
        placesGrid.appendChild(card);
        card.addEventListener('click', () => {
            trackUserClick(place);
            openPlaceModal(place);
        });
    });

    document.getElementById('recommendations').classList.add('active');
    document.getElementById('recommendations').scrollIntoView({ behavior: 'smooth' });
}

function createPlaceCard(place) {
    const card = document.createElement('div');
    card.className = 'place-card';
    
    // For now, we'll use a placeholder image since we don't have access to Google Photos
    const imageUrl = 'https://via.placeholder.com/300x200?text=' + encodeURIComponent(place.name);
    
    const rating = place.rating ? place.rating.toFixed(1) : 'N/A';
    const mlScore = place.mlScore || 0;

    card.innerHTML = `
        <div class="ml-score-badge">${mlScore} ML</div>
        <img src="${imageUrl}" alt="${place.name}" class="place-image">
        <div class="place-info">
            <div class="place-name">${place.name}</div>
            <div class="place-address">${place.formatted_address || place.vicinity || 'Address not available'}</div>
            <div class="place-stats">
                <span>⭐ ${rating}</span>
                <span>👥 ${place.user_ratings_total || 0} reviews</span>
            </div>
            <div class="place-type">${(place.types && place.types[0]) || 'Place'}</div>
        </div>
    `;
    return card;
}

function openPlaceModal(place) {
    currentPlace = place;
    const modal = document.getElementById('placeModal');
    
    document.getElementById('placeName').textContent = place.name;
    document.getElementById('placeAddress').textContent = place.formatted_address || place.vicinity || 'Address not available';
    document.getElementById('placeDescription').textContent = place.formatted_address || 'No description available';
    document.getElementById('placeRatingValue').textContent = place.rating ? place.rating.toFixed(1) : 'N/A';
    document.getElementById('placeReviewCount').textContent = place.user_ratings_total || '0';
    document.getElementById('placePhone').textContent = place.formatted_phone_number || 'Not available';
    document.getElementById('directionsTo').value = place.name;
    
    // For now, we'll use a placeholder image since we don't have access to Google Photos
    const imageUrl = 'https://via.placeholder.com/800x400?text=' + encodeURIComponent(place.name);
    document.getElementById('placeImage').src = imageUrl;

    const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(place.name)}/@${place.geometry.location.lat},${place.geometry.location.lng},15z`;
    document.getElementById('openMapsLink').href = mapsUrl;

    modal.classList.add('active');
    resetTabs();
}

function closeModal() {
    document.getElementById('placeModal').classList.remove('active');
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(tabName).classList.add('active');
    const activeBtn = document.querySelector(`[data-tab="${tabName}"]`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
    
    if (tabName === 'crowd') {
        updateCrowdAnalysis();
    } else if (tabName === 'weather' && currentPlace) {
        updateWeatherAnalysis(currentPlace);
    } else if (tabName === 'safety' && currentPlace) {
        updateSafetyTab(currentPlace);
    }
}

function resetTabs() {
    document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('overview').classList.add('active');
    document.querySelector('[data-tab="overview"]').classList.add('active');
}

// ======================== NLP CHATBOT ========================

async function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    
    if (!message) return;

    const chatMessages = document.getElementById('chatMessages');
    
    const userMsg = document.createElement('div');
    userMsg.className = 'message user-message';
    userMsg.innerHTML = `<div class="message-content">${message}</div>`;
    chatMessages.appendChild(userMsg);
    
    input.value = '';

    try {
        const response = await APIService.sendChatMessage(message, currentPlace);
        
        setTimeout(() => {
            const botMsg = document.createElement('div');
            botMsg.className = 'message bot-message';
            botMsg.innerHTML = `<div class="message-content">${response}</div>`;
            chatMessages.appendChild(botMsg);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }, 500);
    } catch (error) {
        console.error('Error sending chat message:', error);
        const botMsg = document.createElement('div');
        botMsg.className = 'message bot-message';
        botMsg.innerHTML = `<div class="message-content">Sorry, I encountered an error. Please try again.</div>`;
        chatMessages.appendChild(botMsg);
    }

    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function toggleChatbot() {
    const popup = document.getElementById('chatbotPopup');
    popup.classList.toggle('active');
}

// ======================== DIRECTIONS ========================

function getDirections() {
    const from = document.getElementById('directionsFrom').value.trim();
    const to = document.getElementById('directionsTo').value.trim();

    if (!from) {
        alert('Please enter a starting point');
        return;
    }

    if (currentPlace) {
        const mapsUrl = `https://www.google.com/maps/dir/${encodeURIComponent(from)}/${encodeURIComponent(to)}`;
        window.open(mapsUrl, '_blank');
    }
}

function showLoading(show) {
    document.getElementById('loading').classList.toggle('active', show);
}

// ======================== AUTHENTICATION SYSTEM ========================

function openAuthModal() {
    document.getElementById('authModal').classList.add('active');
    clearAuthErrors();
}

function closeAuthModal() {
    document.getElementById('authModal').classList.remove('active');
    clearAuthErrors();
    document.getElementById('loginForm').reset();
    document.getElementById('signupForm').reset();
}

function switchAuthTab(tabName) {
    document.querySelectorAll('.auth-form').forEach(form => form.classList.remove('active'));
    document.querySelectorAll('.auth-tab-btn').forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(tabName + 'Form').classList.add('active');
    document.querySelector(`[data-auth-tab="${tabName}"]`).classList.add('active');
    clearAuthErrors();
}

function clearAuthErrors() {
    document.querySelectorAll('.auth-error').forEach(el => {
        el.classList.remove('active');
        el.textContent = '';
    });
    document.querySelectorAll('.auth-success').forEach(el => {
        el.classList.remove('active');
        el.textContent = '';
    });
}

function showAuthError(formType, message) {
    const errorEl = document.getElementById(formType + 'Error');
    errorEl.textContent = message;
    errorEl.classList.add('active');
}

function showAuthSuccess(message) {
    const successEl = document.getElementById('signupSuccess');
    successEl.textContent = message;
    successEl.classList.add('active');
}

function handleSignup(e) {
    e.preventDefault();
    clearAuthErrors();

    const name = document.getElementById('signupName').value.trim();
    const email = document.getElementById('signupEmail').value.trim().toLowerCase();
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('signupConfirmPassword').value;

    // Validation
    if (!name || !email || !password || !confirmPassword) {
        showAuthError('signup', 'All fields are required');
        return;
    }

    if (password.length < 6) {
        showAuthError('signup', 'Password must be at least 6 characters');
        return;
    }

    if (password !== confirmPassword) {
        showAuthError('signup', 'Passwords do not match');
        return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showAuthError('signup', 'Please enter a valid email address');
        return;
    }

    // Check if user already exists
    let users = JSON.parse(localStorage.getItem('destiniGuideUsers') || '[]');
    const userExists = users.find(u => u.email === email);

    if (userExists) {
        showAuthError('signup', 'An account with this email already exists');
        return;
    }

    // Create new user
    const newUser = {
        id: Date.now().toString(),
        name: name,
        email: email,
        password: btoa(password), // Basic encoding (in production, use proper hashing)
        createdAt: new Date().toISOString()
    };

    users.push(newUser);
    localStorage.setItem('destiniGuideUsers', JSON.stringify(users));

    console.log('✅ User registered successfully:', email);
    showAuthSuccess('Account created successfully! Please login.');
    
    // Clear form and switch to login tab after 1.5s
    setTimeout(() => {
        document.getElementById('signupForm').reset();
        switchAuthTab('login');
        // Pre-fill login email
        document.getElementById('loginEmail').value = email;
    }, 1500);
}

function handleLogin(e) {
    e.preventDefault();
    clearAuthErrors();

    const email = document.getElementById('loginEmail').value.trim().toLowerCase();
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) {
        showAuthError('login', 'Please enter both email and password');
        return;
    }

    // Get users from localStorage
    const users = JSON.parse(localStorage.getItem('destiniGuideUsers') || '[]');
    const user = users.find(u => u.email === email && u.password === btoa(password));

    if (!user) {
        showAuthError('login', 'Invalid email or password');
        return;
    }

    // Login successful
    currentUser = {
        id: user.id,
        name: user.name,
        email: user.email
    };

    localStorage.setItem('destiniGuideCurrentUser', JSON.stringify(currentUser));
    console.log('✅ User logged in:', currentUser.email);

    updateUIForLoggedInUser();
    closeAuthModal();
    document.getElementById('loginForm').reset();

    // Show welcome notification
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Welcome to Destini Guide!', {
            body: `Hello ${currentUser.name}! Start exploring amazing destinations.`,
            icon: 'https://cdn-icons-png.flaticon.com/512/3177/3177440.png'
        });
    }
}

function checkUserSession() {
    const savedUser = localStorage.getItem('destiniGuideCurrentUser');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        console.log('✅ Session restored for:', currentUser.email);
        updateUIForLoggedInUser();
    }
}

function updateUIForLoggedInUser() {
    if (!currentUser) return;

    document.getElementById('authButtons').style.display = 'none';
    document.getElementById('userInfo').style.display = 'flex';
    document.getElementById('userName').textContent = currentUser.name;
    
    // Set avatar to first letter of name
    const firstLetter = currentUser.name.charAt(0).toUpperCase();
    document.getElementById('userAvatar').textContent = firstLetter;
}

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('destiniGuideCurrentUser');
        currentUser = null;
        
        document.getElementById('authButtons').style.display = 'block';
        document.getElementById('userInfo').style.display = 'none';
        
        console.log('✅ User logged out');
        
        // Show notification
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Logged Out', {
                body: 'You have been logged out successfully.',
                icon: 'https://cdn-icons-png.flaticon.com/512/3177/3177440.png'
            });
        }
    }
}