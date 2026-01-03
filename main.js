/**
 * WebGL2 Fullscreen Quad Demo - Hamam Interior
 * 
 * Features:
 * - WebGL2 context initialization
 * - Shader compilation from embedded script tags
 * - Fullscreen quad rendering (no vertex buffers needed)
 * - First-person camera with mouse drag + WASD movement
 * - Uniforms: time, resolution, camera position/direction, quality
 * - Responsive resize handling
 * - FPS counter
 * - Quality slider for future raymarch step control
 * 
 * Optimized for Intel UHD integrated graphics.
 */

// ============================================================================
// Global State
// ============================================================================

/** @type {WebGL2RenderingContext} */
let gl = null;

/** @type {WebGLProgram} */
let shaderProgram = null;

/** Uniform locations cache */
const uniforms = {
    time: null,
    resolution: null,
    cameraPos: null,
    cameraYaw: null,
    cameraPitch: null,
    quality: null
};

/** Camera state - first person controls */
const camera = {
    // Position - start near wall looking toward center
    x: 0.0,
    y: 1.6,       // Eye height (human scale)
    z: 4.0,

    // Orientation (radians)
    yaw: Math.PI,    // Looking toward negative Z (center)
    pitch: 0.0,

    // Movement speed
    moveSpeed: 2.5,   // Units per second
    lookSpeed: 0.003, // Radians per pixel

    // Room bounds for collision
    roomRadius: 4.5,  // Slightly less than ROOM_RADIUS for margin
    minHeight: 0.5,
    maxHeight: 2.2
};

/** Input state */
const input = {
    // Mouse drag state
    isDragging: false,
    lastMouseX: 0,
    lastMouseY: 0,

    // Movement keys (WASD + arrows)
    forward: false,
    backward: false,
    left: false,
    right: false
};

/** Application state */
const state = {
    startTime: 0,
    lastFrameTime: 0,
    quality: 1,         // Quality level (0, 1, 2)
    frameCount: 0,
    lastFpsUpdate: 0,
    fps: 0
};

// ============================================================================
// Shader Compilation Utilities
// ============================================================================

/**
 * Compiles a shader from source code.
 * @param {WebGL2RenderingContext} gl - WebGL2 context
 * @param {number} type - gl.VERTEX_SHADER or gl.FRAGMENT_SHADER
 * @param {string} source - GLSL source code
 * @returns {WebGLShader|null} Compiled shader or null on error
 */
function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    // Check compilation status
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(shader);
        const shaderType = type === gl.VERTEX_SHADER ? 'Vertex' : 'Fragment';
        console.error(`${shaderType} shader compilation failed:\n${info}`);
        gl.deleteShader(shader);
        return null;
    }

    return shader;
}

/**
 * Links vertex and fragment shaders into a program.
 * @param {WebGL2RenderingContext} gl - WebGL2 context
 * @param {WebGLShader} vertexShader - Compiled vertex shader
 * @param {WebGLShader} fragmentShader - Compiled fragment shader
 * @returns {WebGLProgram|null} Linked program or null on error
 */
function linkProgram(gl, vertexShader, fragmentShader) {
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    // Check link status
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const info = gl.getProgramInfoLog(program);
        console.error(`Shader program linking failed:\n${info}`);
        gl.deleteProgram(program);
        return null;
    }

    return program;
}

/**
 * Creates shader program from script tag IDs.
 * @param {WebGL2RenderingContext} gl - WebGL2 context
 * @param {string} vertexScriptId - ID of vertex shader script element
 * @param {string} fragmentScriptId - ID of fragment shader script element
 * @returns {WebGLProgram|null} Linked program or null on error
 */
function createProgramFromScripts(gl, vertexScriptId, fragmentScriptId) {
    // Get shader source from script tags
    const vertexScript = document.getElementById(vertexScriptId);
    const fragmentScript = document.getElementById(fragmentScriptId);

    if (!vertexScript || !fragmentScript) {
        console.error('Shader script elements not found');
        return null;
    }

    const vertexSource = vertexScript.textContent.trim();
    const fragmentSource = fragmentScript.textContent.trim();

    // Compile shaders
    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

    if (!vertexShader || !fragmentShader) {
        return null;
    }

    // Link program
    const program = linkProgram(gl, vertexShader, fragmentShader);

    // Clean up individual shaders (they're now part of the program)
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    return program;
}

// ============================================================================
// WebGL2 Initialization
// ============================================================================

/**
 * Initializes WebGL2 context and shader program.
 * @returns {boolean} True if initialization succeeded
 */
function initWebGL() {
    const canvas = document.getElementById('glCanvas');

    // Request WebGL2 context with performance hints for iGPU
    gl = canvas.getContext('webgl2', {
        alpha: false,               // No alpha in backbuffer (slight perf gain)
        antialias: false,           // Disable AA for better iGPU performance
        powerPreference: 'default', // Let browser decide (good for iGPU)
        preserveDrawingBuffer: false
    });

    if (!gl) {
        console.error('WebGL2 is not supported by this browser');
        alert('WebGL2 is not supported. Please use a modern browser.');
        return false;
    }

    console.log('WebGL2 initialized');
    console.log('Renderer:', gl.getParameter(gl.RENDERER));
    console.log('Vendor:', gl.getParameter(gl.VENDOR));

    // Create shader program from embedded scripts
    shaderProgram = createProgramFromScripts(gl, 'vertex-shader', 'fragment-shader');

    if (!shaderProgram) {
        console.error('Failed to create shader program');
        return false;
    }

    // Cache uniform locations for efficient updates
    uniforms.time = gl.getUniformLocation(shaderProgram, 'u_time');
    uniforms.resolution = gl.getUniformLocation(shaderProgram, 'u_resolution');
    uniforms.cameraPos = gl.getUniformLocation(shaderProgram, 'u_cameraPos');
    uniforms.cameraYaw = gl.getUniformLocation(shaderProgram, 'u_cameraYaw');
    uniforms.cameraPitch = gl.getUniformLocation(shaderProgram, 'u_cameraPitch');
    uniforms.quality = gl.getUniformLocation(shaderProgram, 'u_quality');

    // Use the shader program
    gl.useProgram(shaderProgram);

    // Set initial canvas size
    resizeCanvas();

    return true;
}

// ============================================================================
// Canvas Resize Handling
// ============================================================================

/**
 * Resizes canvas to match display size and updates WebGL viewport.
 * Uses devicePixelRatio for sharp rendering on HiDPI displays,
 * but caps it for iGPU performance.
 */
function resizeCanvas() {
    const canvas = gl.canvas;

    // Cap pixel ratio for iGPU performance (max 1.5x)
    const maxPixelRatio = 1.5;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, maxPixelRatio);

    // Calculate required canvas size
    const displayWidth = Math.floor(canvas.clientWidth * pixelRatio);
    const displayHeight = Math.floor(canvas.clientHeight * pixelRatio);

    // Only resize if dimensions changed
    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;

        // Update WebGL viewport
        gl.viewport(0, 0, displayWidth, displayHeight);

        console.log(`Canvas resized to ${displayWidth}x${displayHeight}`);
    }
}

// ============================================================================
// Camera Movement & Collision
// ============================================================================

/**
 * Updates camera position based on current input state.
 * Applies simple cylindrical collision to keep camera inside room.
 * @param {number} deltaTime - Time since last frame in seconds
 */
function updateCamera(deltaTime) {
    // Calculate movement direction relative to camera yaw
    let moveX = 0;
    let moveZ = 0;

    // Forward/backward (along view direction, XZ plane only)
    if (input.forward) {
        moveX += Math.sin(camera.yaw);
        moveZ += Math.cos(camera.yaw);
    }
    if (input.backward) {
        moveX -= Math.sin(camera.yaw);
        moveZ -= Math.cos(camera.yaw);
    }

    // Strafe left/right (perpendicular to view direction)
    if (input.left) {
        moveX += Math.cos(camera.yaw);
        moveZ -= Math.sin(camera.yaw);
    }
    if (input.right) {
        moveX -= Math.cos(camera.yaw);
        moveZ += Math.sin(camera.yaw);
    }

    // Normalize diagonal movement
    const moveLen = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (moveLen > 0.001) {
        moveX /= moveLen;
        moveZ /= moveLen;
    }

    // Apply movement
    const speed = camera.moveSpeed * deltaTime;
    let newX = camera.x + moveX * speed;
    let newZ = camera.z + moveZ * speed;

    // Collision: keep inside cylindrical room
    const distFromCenter = Math.sqrt(newX * newX + newZ * newZ);
    if (distFromCenter > camera.roomRadius) {
        // Push back to room edge
        const scale = camera.roomRadius / distFromCenter;
        newX *= scale;
        newZ *= scale;
    }

    // Additional collision: avoid göbektaşı (central platform)
    const gobekRadius = 2.0; // Slightly larger than GOBEK_RADIUS for margin
    if (distFromCenter < gobekRadius && camera.y < 0.6) {
        // Push away from center
        const pushScale = gobekRadius / Math.max(distFromCenter, 0.1);
        newX *= pushScale;
        newZ *= pushScale;
    }

    camera.x = newX;
    camera.z = newZ;
}

// ============================================================================
// Input Handling
// ============================================================================

/**
 * Sets up mouse drag and keyboard event listeners for first-person camera.
 */
function setupInputHandlers() {
    const canvas = document.getElementById('glCanvas');

    // --- Mouse drag for look ---
    canvas.addEventListener('mousedown', (e) => {
        if (e.button === 0) { // Left button
            input.isDragging = true;
            input.lastMouseX = e.clientX;
            input.lastMouseY = e.clientY;
            canvas.style.cursor = 'grabbing';
        }
    });

    document.addEventListener('mouseup', (e) => {
        if (e.button === 0) {
            input.isDragging = false;
            canvas.style.cursor = 'grab';
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (input.isDragging) {
            const deltaX = e.clientX - input.lastMouseX;
            const deltaY = e.clientY - input.lastMouseY;

            // Update camera orientation
            camera.yaw -= deltaX * camera.lookSpeed;
            camera.pitch -= deltaY * camera.lookSpeed;

            // Clamp pitch to prevent flipping (-85° to +85°)
            const maxPitch = 1.48; // ~85 degrees in radians
            camera.pitch = Math.max(-maxPitch, Math.min(maxPitch, camera.pitch));

            input.lastMouseX = e.clientX;
            input.lastMouseY = e.clientY;
        }
    });

    // Set initial cursor style
    canvas.style.cursor = 'grab';

    // --- Keyboard for movement (WASD + arrows) ---
    document.addEventListener('keydown', (e) => {
        switch (e.code) {
            case 'KeyW':
            case 'ArrowUp':
                input.forward = true;
                e.preventDefault();
                break;
            case 'KeyS':
            case 'ArrowDown':
                input.backward = true;
                e.preventDefault();
                break;
            case 'KeyA':
            case 'ArrowLeft':
                input.left = true;
                e.preventDefault();
                break;
            case 'KeyD':
            case 'ArrowRight':
                input.right = true;
                e.preventDefault();
                break;
        }
    });

    document.addEventListener('keyup', (e) => {
        switch (e.code) {
            case 'KeyW':
            case 'ArrowUp':
                input.forward = false;
                break;
            case 'KeyS':
            case 'ArrowDown':
                input.backward = false;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                input.left = false;
                break;
            case 'KeyD':
            case 'ArrowRight':
                input.right = false;
                break;
        }
    });

    // --- Touch support for mobile ---
    let touchStartX = 0;
    let touchStartY = 0;

    canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            e.preventDefault();
        }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1) {
            const deltaX = e.touches[0].clientX - touchStartX;
            const deltaY = e.touches[0].clientY - touchStartY;

            camera.yaw -= deltaX * camera.lookSpeed;
            camera.pitch -= deltaY * camera.lookSpeed;

            const maxPitch = 1.48;
            camera.pitch = Math.max(-maxPitch, Math.min(maxPitch, camera.pitch));

            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            e.preventDefault();
        }
    }, { passive: false });

    // --- Quality slider ---
    const qualitySlider = document.getElementById('quality-slider');
    const qualityValue = document.getElementById('quality-value');

    qualitySlider.addEventListener('input', (e) => {
        state.quality = parseInt(e.target.value, 10);
        qualityValue.textContent = state.quality;
    });

    // --- Window resize handler with debouncing ---
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(resizeCanvas, 100);
    });
}

// ============================================================================
// FPS Counter
// ============================================================================

/**
 * Updates FPS counter display.
 * Called every frame, but only updates display periodically.
 * @param {number} currentTime - Current timestamp in milliseconds
 */
function updateFPS(currentTime) {
    state.frameCount++;

    // Update FPS display every 500ms
    const elapsed = currentTime - state.lastFpsUpdate;
    if (elapsed >= 500) {
        state.fps = Math.round((state.frameCount * 1000) / elapsed);
        state.frameCount = 0;
        state.lastFpsUpdate = currentTime;

        document.getElementById('fps-counter').textContent = `FPS: ${state.fps}`;
    }
}

// ============================================================================
// Render Loop
// ============================================================================

/**
 * Main render function - called every frame via requestAnimationFrame.
 * @param {number} timestamp - High-resolution timestamp from rAF
 */
function render(timestamp) {
    // Calculate delta time for smooth movement
    const deltaTime = Math.min((timestamp - state.lastFrameTime) / 1000, 0.1);
    state.lastFrameTime = timestamp;

    // Calculate elapsed time in seconds
    const timeSeconds = (timestamp - state.startTime) / 1000;

    // Update FPS counter
    updateFPS(timestamp);

    // Update camera position based on input
    updateCamera(deltaTime);

    // Ensure canvas matches display size (handles dynamic resizes)
    resizeCanvas();

    // Update uniforms
    gl.uniform1f(uniforms.time, timeSeconds);
    gl.uniform2f(uniforms.resolution, gl.canvas.width, gl.canvas.height);
    gl.uniform3f(uniforms.cameraPos, camera.x, camera.y, camera.z);
    gl.uniform1f(uniforms.cameraYaw, camera.yaw);
    gl.uniform1f(uniforms.cameraPitch, camera.pitch);
    gl.uniform1i(uniforms.quality, state.quality);

    // Clear and draw fullscreen quad
    // Using gl_VertexID in vertex shader, so no VBO needed - just draw 6 vertices
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Schedule next frame
    requestAnimationFrame(render);
}

// ============================================================================
// Entry Point
// ============================================================================

/**
 * Application entry point - called when DOM is ready.
 */
function main() {
    console.log('Initializing WebGL2 Hamam Demo...');
    console.log('Controls: WASD/Arrows to move, mouse drag to look');

    // Initialize WebGL2
    if (!initWebGL()) {
        return;
    }

    // Setup input handlers
    setupInputHandlers();

    // Record start time for animation
    state.startTime = performance.now();
    state.lastFrameTime = state.startTime;
    state.lastFpsUpdate = state.startTime;

    // Start render loop
    console.log('Starting render loop');
    requestAnimationFrame(render);
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
} else {
    main();
}
