<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

$db_file = 'users.json';

// Initialize "database"
if (!file_exists($db_file)) {
    file_put_contents($db_file, json_encode(['users' => []]));
}

$input = json_decode(file_get_contents('php://input'), true);
$action = $_GET['action'] ?? '';

function get_db() {
    global $db_file;
    return json_decode(file_get_contents($db_file), true);
}

function save_db($data) {
    global $db_file;
    file_put_contents($db_file, json_encode($data, JSON_PRETTY_PRINT));
}

switch ($action) {
    case 'register':
        $username = $input['username'] ?? '';
        $password = $input['password'] ?? '';
        
        if (!$username || !$password) {
            echo json_encode(['status' => 400, 'message' => 'Username and password required']);
            break;
        }
        
        $db = get_db();
        foreach ($db['users'] as $user) {
            if ($user['username'] === $username) {
                echo json_encode(['status' => 400, 'message' => 'Username already exists']);
                exit;
            }
        }
        
        $db['users'][] = [
            'username' => $username,
            'password' => password_hash($password, PASSWORD_DEFAULT),
            'bookmarks' => [],
            'history' => []
        ];
        save_db($db);
        echo json_encode(['status' => 200, 'message' => 'Successful registration']);
        break;

    case 'login':
        $username = $input['username'] ?? '';
        $password = $input['password'] ?? '';
        
        $db = get_db();
        foreach ($db['users'] as $user) {
            if ($user['username'] === $username && password_verify($password, $user['password'])) {
                echo json_encode([
                    'status' => 200, 
                    'message' => 'Login successful', 
                    'token' => base64_encode($username), // Simple token for demo
                    'data' => [
                        'bookmarks' => $user['bookmarks'],
                        'history' => $user['history']
                    ]
                ]);
                exit;
            }
        }
        echo json_encode(['status' => 401, 'message' => 'Invalid credentials']);
        break;

    case 'sync':
        $token = $_GET['token'] ?? '';
        $username = base64_decode($token);
        $bookmarks = $input['bookmarks'] ?? null;
        $history = $input['history'] ?? null;
        
        $db = get_db();
        $found = false;
        foreach ($db['users'] as &$user) {
            if ($user['username'] === $username) {
                if ($bookmarks !== null) $user['bookmarks'] = $bookmarks;
                if ($history !== null) $user['history'] = $history;
                $found = true;
                break;
            }
        }
        
        if ($found) {
            save_db($db);
            echo json_encode(['status' => 200, 'message' => 'Sync successful']);
        } else {
            echo json_encode(['status' => 401, 'message' => 'Unauthorized']);
        }
        break;

    default:
        echo json_encode(['status' => 404, 'message' => 'Action not found']);
        break;
}
?>
