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
$db_name = 'u336321780_komik'; // Update with your DB name
$db_user = 'u336321780_komik'; // Update with your DB user
$db_pass = '&VDdS7sZ';   // Update with your DB password

try {
    $pdo = new PDO("mysql:host=$db_host;dbname=$db_name", $db_user, $db_pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
    ]);

    // Auto-create table if not exists
    $pdo->exec("CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        bookmarks TEXT,
        history TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");

} catch (PDOException $e) {
    echo json_encode(['status' => 500, 'message' => 'Database connection failed']);
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
            $stmt = $pdo->prepare("INSERT INTO users (username, password, bookmarks, history) VALUES (?, ?, '[]', '[]')");
            $stmt->execute([$username, password_hash($password, PASSWORD_DEFAULT)]);
            echo json_encode(['status' => 200, 'message' => 'Successful registration']);
        } catch (PDOException $e) {
            if ($e->getCode() == 23000) {
                echo json_encode(['status' => 400, 'message' => 'Username already exists']);
            } else {
                echo json_encode(['status' => 500, 'message' => 'Registration failed']);
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
            echo json_encode([
                'status' => 200,
                'message' => 'Login successful',
                'token' => base64_encode($username),
                'data' => [
                    'bookmarks' => json_decode($user['bookmarks'] ?: '{}', true),
                    'history' => json_decode($user['history'] ?: '{}', true)
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

        if (!$username) {
            echo json_encode(['status' => 401, 'message' => 'Unauthorized']);
            exit;
        }

        $sql = "UPDATE users SET ";
        $params = [];
        if ($bookmarks !== null) {
            $sql .= "bookmarks = ?, ";
            $params[] = json_encode($bookmarks);
        }
        if ($history !== null) {
            $sql .= "history = ?, ";
            $params[] = json_encode($history);
        }

        if (empty($params)) {
            echo json_encode(['status' => 200, 'message' => 'Nothing to sync']);
            exit;
        }

        $sql = rtrim($sql, ', ') . " WHERE username = ?";
        $params[] = $username;

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        echo json_encode(['status' => 200, 'message' => 'Sync successful']);
        break;

    default:
        echo json_encode(['status' => 404, 'message' => 'Action not found']);
        break;
}
?>