<?php
// Simple CORS proxy for audio files
// Save this as cors-proxy.php in your website root

// Allow requests from your domain
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET');
header('Access-Control-Allow-Headers: Range');

// Get the URL from the query string
$url = isset($_GET['url']) ? $_GET['url'] : '';

// Validate URL
if (empty($url) || !filter_var($url, FILTER_VALIDATE_URL)) {
    header('HTTP/1.1 400 Bad Request');
    exit('Invalid URL provided');
}

// Only allow URLs from your trusted domain
if (!preg_match('/^https:\/\/vault\.petsq\.net\//', $url)) {
    header('HTTP/1.1 403 Forbidden');
    exit('URL not allowed');
}

// Process Range headers (for seek operations)
$headers = [];
if (isset($_SERVER['HTTP_RANGE'])) {
    $headers[] = 'Range: ' . $_SERVER['HTTP_RANGE'];
}

// Initialize cURL session
$ch = curl_init($url);

// Set cURL options
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_MAXREDIRS => 5,
    CURLOPT_CONNECTTIMEOUT => 30,
    CURLOPT_HTTPHEADER => $headers,
    CURLOPT_HEADER => true
]);

// Execute cURL request
$response = curl_exec($ch);

// Check for errors
if (curl_errno($ch)) {
    header('HTTP/1.1 502 Bad Gateway');
    exit('Error fetching content: ' . curl_error($ch));
}

// Parse response into headers and body
$header_size = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
$response_headers = substr($response, 0, $header_size);
$body = substr($response, $header_size);
$status_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);

// Close cURL session
curl_close($ch);

// Set status code
http_response_code($status_code);

// Parse and forward relevant headers
$raw_headers = explode("\n", $response_headers);
foreach ($raw_headers as $h) {
    $h = trim($h);
    if (preg_match('/^Content-Type:/i', $h)) {
        header($h);
    }
    if (preg_match('/^Content-Length:/i', $h)) {
        header($h);
    }
    if (preg_match('/^Content-Range:/i', $h)) {
        header($h);
    }
    if (preg_match('/^Accept-Ranges:/i', $h)) {
        header($h);
    }
}

// Output the body
echo $body;