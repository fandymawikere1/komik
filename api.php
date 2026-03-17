<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit;
}

// Database Credentials - UPDATE THESE
$db_host = 'localhost';
$db_name = 'u336321780_komik'; 
$db_user = 'u336321780_komik'; 
$db_pass = '&VDdS7sZ';   

try {
    $pdo = new PDO("mysql:host=$db_host;dbname=$db_name", $db_user, $db_pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8"
    ]);
    
    // 1. Users Table
    $pdo->exec("CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");

    // 2. Bookmarks Table
    $pdo->exec("CREATE TABLE IF NOT EXISTS bookmarks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        slug VARCHAR(255) NOT NULL,
        title VARCHAR(255),
        cover TEXT,
        format VARCHAR(50),
        UNIQUE KEY user_slug (user_id, slug),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )");

    // 3. History Table
    $pdo->exec("CREATE TABLE IF NOT EXISTS history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        slug VARCHAR(255) NOT NULL,
        last_chapter VARCHAR(50),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY user_slug_hist (user_id, slug),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )");

} catch (PDOException $e) {
    echo json_encode(['status' => 500, 'message' => 'Database connection failed: ' . $e->getMessage()]);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
$action = $_GET['action'] ?? '';

switch ($action) {
    case 'register':
        $username = $input['username'] ?? '';
        $password = $input['password'] ?? '';
        
        if (!$username || !$password) {
            echo json_encode(['status' => 400, 'message' => 'Username and password required']);
            break;
        }
        
        try {
            $stmt = $pdo->prepare("INSERT INTO users (username, password) VALUES (?, ?)");
            $stmt->execute([$username, password_hash($password, PASSWORD_DEFAULT)]);
            echo json_encode(['status' => 200, 'message' => 'Successful registration']);
        } catch (PDOException $e) {
            if ($e->getCode() == 23000) {
                echo json_encode(['status' => 400, 'message' => 'Username already exists']);
            } else {
                echo json_encode(['status' => 500, 'message' => 'Registration failed: ' . $e->getMessage()]);
            }
        }
        break;

    case 'login':
        $username = $input['username'] ?? '';
        $password = $input['password'] ?? '';
        
        $stmt = $pdo->prepare("SELECT * FROM users WHERE username = ?");
        $stmt->execute([$username]);
        $user = $stmt->fetch();
        
        if ($user && password_verify($password, $user['password'])) {
            // Fetch Bookmarks
            $stmt = $pdo->prepare("SELECT slug, title, cover, format FROM bookmarks WHERE user_id = ?");
            $stmt->execute([$user['id']]);
            $bookmarksRaw = $stmt->fetchAll();
            $bookmarks = [];
            foreach ($bookmarksRaw as $b) {
                $bookmarks[$b['slug']] = $b;
            }

            // Fetch History
            $stmt = $pdo->prepare("SELECT slug, last_chapter FROM history WHERE user_id = ?");
            $stmt->execute([$user['id']]);
            $historyRaw = $stmt->fetchAll();
            $history = [];
            foreach ($historyRaw as $h) {
                $history[$h['slug']] = $h['last_chapter'];
            }

            echo json_encode([
                'status' => 200, 
                'message' => 'Login successful', 
                'token' => base64_encode($username),
                'data' => [
                    'bookmarks' => (object)$bookmarks,
                    'history' => (object)$history
                ]
            ]);
        } else {
            echo json_encode(['status' => 401, 'message' => 'Invalid credentials']);
        }
        break;

    case 'sync':
        $token = $_GET['token'] ?? '';
        $username = base64_decode($token);
        $bookmarks = $input['bookmarks'] ?? null;
        $history = $input['history'] ?? null;
        
        if (!$token || !$username) {
            echo json_encode(['status' => 401, 'message' => 'Unauthorized: Invalid or missing token']);
            exit;
        }

        $stmt = $pdo->prepare("SELECT id FROM users WHERE username = ?");
        $stmt->execute([$username]);
        $user = $stmt->fetch();

        if (!$user) {
            echo json_encode(['status' => 401, 'message' => 'Unauthorized: User not found (' . $username . ')']);
            exit;
        }

        $userId = $user['id'];

        try {
            // Sync Bookmarks
            if ($bookmarks !== null && is_array($bookmarks)) {
                foreach ($bookmarks as $slug => $data) {
                    if (empty($slug)) continue;
                    $stmt = $pdo->prepare("INSERT INTO bookmarks (user_id, slug, title, cover, format) 
                                         VALUES (?, ?, ?, ?, ?) 
                                         ON DUPLICATE KEY UPDATE title=VALUES(title), cover=VALUES(cover), format=VALUES(format)");
                    $stmt->execute([$userId, $slug, $data['title'] ?? '', $data['cover'] ?? '', $data['format'] ?? '']);
                }
            }

            // Sync History
            if ($history !== null && is_array($history)) {
                foreach ($history as $slug => $lastChapter) {
                    if (empty($slug)) continue;
                    $stmt = $pdo->prepare("INSERT INTO history (user_id, slug, last_chapter) 
                                         VALUES (?, ?, ?) 
                                         ON DUPLICATE KEY UPDATE last_chapter=VALUES(last_chapter)");
                    $stmt->execute([$userId, $slug, (string)$lastChapter]);
                }
            }
            
            echo json_encode(['status' => 200, 'message' => 'Sync successful']);
        } catch (PDOException $e) {
            echo json_encode(['status' => 500, 'message' => 'Sync failed: ' . $e->getMessage()]);
        }
        break;

    default:
        echo json_encode(['status' => 404, 'message' => 'Action not found']);
        break;
}
?>