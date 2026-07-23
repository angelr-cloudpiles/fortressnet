<?php
/**
 * FortressNet WordPress hardening controls for the protected SoportaMe origin.
 * This file is deployed as an MU plugin and loads before normal plugins.
 */

if (!defined('ABSPATH')) {
    exit;
}

add_filter('xmlrpc_enabled', '__return_false');

add_action('parse_request', static function (): void {
    if (is_admin()) {
        return;
    }

    $query = $_SERVER['QUERY_STRING'] ?? '';
    if (preg_match('/(?:^|&)author=\d+(?:&|$)/', $query) === 1) {
        status_header(403);
        nocache_headers();
        exit;
    }
}, 0);

add_filter('rest_pre_dispatch', static function ($result, $server, $request) {
    $route = $request->get_route();
    if ($route === '/wp/v2/users' || str_starts_with($route, '/wp/v2/users/')) {
        return new WP_Error('fortressnet_user_enumeration_denied', 'Forbidden', ['status' => 403]);
    }

    return $result;
}, 10, 3);
