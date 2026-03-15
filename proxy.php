<?php
/**
 * Image Proxy for Manga Reader
 * Usage: proxy.php?url=https://cdn.komikcast.com/image.jpg
 */

// 1. Get the URL from query parameter
$url = isset($_GET['url']) ? $_GET['url'] : '';

if (empty($url)) {
    header("HTTP/1.1 400 Bad Request");
    echo "URL parameter is required.";
    exit;
}

// 2. Clear anything before sending headers
ob_clean();

// 3. Initialize CURL
$ch = curl_init();

// 4. Set CURL options
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false); // Ignore SSL errors for better compatibility
curl_setopt($ch, CURLOPT_TIMEOUT, 30);

// 5. THE MAGIC: Set the Referer header
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Referer: https://v1.komikcast.fit/',
    'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
]);

// 6. Execute request
$response = curl_exec($ch);
$info = curl_getinfo($ch);
curl_close($ch);

// 7. Check if request was successful
if ($response === false || $info['http_code'] != 200) {
    header("HTTP/1.1 404 Not Found");
    echo "Failed to fetch image.";
    exit;
}

// 8. Forward the content type (image/jpeg, image/webp, etc.)
if (isset($info['content_type'])) {
    header("Content-Type: " . $info['content_type']);
} else {
    header("Content-Type: image/jpeg"); // Default fallback
}

// 9. Output the image data
echo $response;
exit;
