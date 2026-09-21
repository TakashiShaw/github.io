// ==========================================================
// INTERACTIVE PORTFOLIO
//
// PHASE 4B
//
// Features:
// - Portfolio panels
// - Sidebar interaction
// - Room object interaction
// - WASD / arrow-key player movement
// - Floor boundaries
// - Basic furniture collision
// - Proximity detection
// - Press E to interact
//
// Custom avatar comes later.
// ==========================================================



// ==========================================================
// PAGE ELEMENTS
// ==========================================================

const portfolioPanel =
    document.querySelector("#portfolio-panel");

const panelContent =
    document.querySelector("#panel-content");

const panelSectionLabel =
    document.querySelector("#panel-section-label");

const closePanelButton =
    document.querySelector("#close-panel");


const menuLinks =
    document.querySelectorAll(
        "#portfolio-menu [data-section]"
    );


const roomObjects =
    document.querySelectorAll(
        ".room-object[data-section]"
    );


const room =
    document.querySelector("#room");


const player =
    document.querySelector("#player");
    const playerSprite =
    document.querySelector("#player-sprite");


const interactionPrompt =
    document.querySelector("#interaction-prompt");


const interactionText =
    document.querySelector("#interaction-text");



// ==========================================================
// PORTFOLIO SECTION NAMES
// ==========================================================

const sectionNames = {

    projects: "PROJECTS",

    resume: "RESUME",

    about: "ABOUT ME",

    experience: "EXPERIENCE",

    skills: "SKILLS",

    interests: "INTERESTS",

    contact: "CONTACT"

};



// ==========================================================
// PORTFOLIO PANEL SYSTEM
// ==========================================================

function openSection(sectionId) {

    const sourceSection =
        document.getElementById(sectionId);


    if (!sourceSection) {

        console.error(
            `Could not find section: ${sectionId}`
        );

        return;
    }


    // Copy original section into floating panel.

    panelContent.innerHTML =
        sourceSection.innerHTML;

    panelContent.scrollTop = 0;

    pressedKeys.clear();


    panelSectionLabel.textContent =
        sectionNames[sectionId] || "PORTFOLIO";


    // Highlight selected sidebar entry.

    menuLinks.forEach((link) => {

        const isSelected =
            link.dataset.section === sectionId;


        link.classList.toggle(
            "active-menu",
            isSelected
        );

    });


    // Highlight corresponding room object.

    roomObjects.forEach((object) => {

        const isSelected =
            object.dataset.section === sectionId;


        object.classList.toggle(
            "active-object",
            isSelected
        );

    });


    portfolioPanel.classList.add("open");


    portfolioPanel.setAttribute(
        "aria-hidden",
        "false"
    );


    closePanelButton.focus();

}



function closePanel() {

    portfolioPanel.classList.remove("open");


    pressedKeys.clear();


    portfolioPanel.setAttribute(
        "aria-hidden",
        "true"
    );


    menuLinks.forEach((link) => {

        link.classList.remove(
            "active-menu"
        );

    });


    roomObjects.forEach((object) => {

        object.classList.remove(
            "active-object"
        );

    });


    // Return focus to the game.

    player.focus();

}



// ==========================================================
// SIDEBAR CLICK INTERACTION
// ==========================================================

menuLinks.forEach((link) => {

    link.addEventListener(
        "click",
        function (event) {

            event.preventDefault();


            const sectionId =
                link.dataset.section;


            openSection(sectionId);

        }
    );

});



// ==========================================================
// ROOM OBJECT CLICK INTERACTION
// ==========================================================

roomObjects.forEach((object) => {

    object.addEventListener(
        "click",
        function () {

            const sectionId =
                object.dataset.section;


            openSection(sectionId);

        }
    );


    object.addEventListener(
        "keydown",
        function (event) {

            if (
                event.key === "Enter" ||
                event.key === " "
            ) {

                event.preventDefault();


                const sectionId =
                    object.dataset.section;


                openSection(sectionId);

            }

        }
    );

});



// ==========================================================
// CLOSE PORTFOLIO PANEL
// ==========================================================

closePanelButton.addEventListener(
    "click",
    closePanel
);


portfolioPanel.addEventListener(
    "click",
    function (event) {

        if (
            event.target === portfolioPanel
        ) {

            closePanel();

        }

    }
);



// ==========================================================
// PLAYER POSITION
//
// We store position as percentages of the room.
//
// This keeps the player reasonably responsive if the
// browser size changes.
// ==========================================================

let playerX = 61;

let playerY = 64;

// ==========================================================
// PLAYER PERSPECTIVE SCALE
//
// Uses the same Y-range as the actual walkable floor.
// 41 = back wall
// 94 = front of room
// ==========================================================

function getPlayerScale(y) {

    const floorTop = 44;
    const floorBottom = 94;

    const progress =
        (y - floorTop) /
        (floorBottom - floorTop);

    const clampedProgress =
        Math.max(
            0,
            Math.min(1, progress)
        );

    // Back of room: 0.75
    // Front of room: 1.40
    return (
        0.75 +
        clampedProgress * 0.65
    );
}

function updatePlayerPosition() {

    player.style.left =
        `${playerX}%`;


    player.style.top =
        `${playerY}%`;




   // ==================================================
// ROOM PERSPECTIVE
// ==================================================

const scale =
    getPlayerScale(playerY);

player.style.setProperty(
    "--player-scale",
    scale
);

}
// ==========================================================
// KEYBOARD STATE
// ==========================================================

const pressedKeys =
    new Set();


const movementKeys =
    new Set([
        "w",
        "a",
        "s",
        "d",
        "arrowup",
        "arrowdown",
        "arrowleft",
        "arrowright"
    ]);



// ==========================================================
// KEY DOWN
// ==========================================================

document.addEventListener(
    "keydown",
    function (event) {

        const key =
            event.key.toLowerCase();


        const panelIsOpen =
            portfolioPanel.classList.contains(
                "open"
            );


        // ==================================================
        // PORTFOLIO PANEL CONTROLS
        //
        // W = scroll up
        // S = scroll down
        // E = close panel
        // Escape = close panel
        // ==================================================

        if (panelIsOpen) {

            if (key === "w") {

                event.preventDefault();


                panelContent.scrollBy({
                    top: -85,
                    behavior: "smooth"
                });


                return;

            }


            if (key === "s") {

                event.preventDefault();


                panelContent.scrollBy({
                    top: 85,
                    behavior: "smooth"
                });


                return;

            }


            if (
                key === "e" ||
                key === "escape"
            ) {

                event.preventDefault();


                closePanel();


                return;

            }


            return;

        }


        // ==================================================
        // E = INTERACT WITH NEARBY OBJECT
        // ==================================================

        if (
            key === "e" &&
            nearbyObject
        ) {

            event.preventDefault();


            const sectionId =
                nearbyObject.dataset.section;


            openSection(sectionId);


            return;

        }


        // ==================================================
        // PLAYER MOVEMENT
        // ==================================================

        if (
            movementKeys.has(key)
        ) {

            event.preventDefault();


            pressedKeys.add(key);

        }

    }
);


// ==========================================================
// KEY UP
// ==========================================================

document.addEventListener(
    "keyup",
    function (event) {

        const key =
            event.key.toLowerCase();


        pressedKeys.delete(key);

    }
);



// ==========================================================
// PLAYER FLOOR BOUNDARIES
//
// The floor is trapezoid-shaped.
//
// At the back of the floor there is a larger inset.
// Toward the front, the player can move farther left/right.
// ==========================================================

function getFloorBounds(y) {

    const floorTop = 44;

    const floorBottom = 94;


    const clampedY =
        Math.max(
            floorTop,
            Math.min(
                floorBottom,
                y
            )
        );


    const progress =
        (
            clampedY -
            floorTop
        ) /
        (
            floorBottom -
            floorTop
        );


    // Floor begins around 8% inset at the back
    // and widens toward the front.

    const sideInset =
        8 * (1 - progress);


    return {

        minX:
            sideInset + 2,

        maxX:
            100 - sideInset - 2,

        minY:
            floorTop,

        maxY:
            floorBottom

    };

}



// ==========================================================
// SIMPLE FURNITURE COLLISION
//
// We use the first visual child inside each room object,
// not the text label.
//
// This keeps the player from walking through furniture.
// ==========================================================

function collidesWithFurniture(
    candidateX,
    candidateY
) {

    const roomRect =
        room.getBoundingClientRect();


    // Convert the candidate player position
    // from room percentages into screen pixels.

    const playerPixelX =
        roomRect.left +
        (candidateX / 100) *
        roomRect.width;

    const playerPixelY =
        roomRect.top +
        (candidateY / 100) *
        roomRect.height;


    // ======================================================
    // PLAYER FEET HITBOX
    //
    // Collision should happen around the feet,
    // not around the character's entire body.
    // ======================================================

    const playerHalfWidth = 22;
    const playerHalfHeight = 8;

// ======================================================
// DECORATIVE WORLD COLLISIONS
// ======================================================

const worldCollisionElements =
    room.querySelectorAll(
        "[data-world-collision]"
    );

for (
    const collisionElement
    of worldCollisionElements
) {

    const objectRect =
        collisionElement.getBoundingClientRect();

    const collisionPadding = 3;

    const collision =
        playerPixelX + playerHalfWidth >
            objectRect.left -
            collisionPadding &&

        playerPixelX - playerHalfWidth <
            objectRect.right +
            collisionPadding &&

        playerPixelY + playerHalfHeight >
            objectRect.top -
            collisionPadding &&

        playerPixelY - playerHalfHeight <
            objectRect.bottom +
            collisionPadding;

    if (collision) {
        return true;
    }
}
    // ======================================================
    // CHECK PORTFOLIO OBJECTS
    // ======================================================

    for (const object of roomObjects) {

        const customCollisionElements =
            object.querySelectorAll(
                "[data-collision]"
            );


        let collisionElements;


        // Use custom collision boxes when they exist.

        if (
            customCollisionElements.length > 0
        ) {

            collisionElements =
                customCollisionElements;

        }

        // Otherwise use the object's main visual.

        else {

            const visual =
                object.firstElementChild;

            if (!visual) {
                continue;
            }

            collisionElements = [visual];

        }


        // Check each collision rectangle.

        for (
            const collisionElement
            of collisionElements
        ) {

            const objectRect =
                collisionElement
                    .getBoundingClientRect();

            const collisionPadding = 4;


            const collision =
                playerPixelX + playerHalfWidth >
                    objectRect.left -
                    collisionPadding &&

                playerPixelX - playerHalfWidth <
                    objectRect.right +
                    collisionPadding &&

                playerPixelY + playerHalfHeight >
                    objectRect.top -
                    collisionPadding &&

                playerPixelY - playerHalfHeight <
                    objectRect.bottom +
                    collisionPadding;


            if (collision) {
                return true;
            }

        }

    }


    return false;
}


// ==========================================================
// PLAYER MOVEMENT
// ==========================================================

const PLAYER_SPEED = 220;
// ==========================================================
// PLAYER SPRITE ANIMATION
// ==========================================================

const PLAYER_FRAME_TIME = 120;

const PLAYER_SPRITES = {

    down: {
        idle: "images/player/player-front.png",

        walk: [
            "images/player/player-front-walk-1.png",
            "images/player/player-front-walk-2.png",
            "images/player/player-front-walk-3.png",
            "images/player/player-front-walk-2.png"
        ]
    },

    up: {
        idle: "images/player/player-back.png",

        walk: [
            "images/player/player-back-walk-1.png",
            "images/player/player-back-walk-2.png",
            "images/player/player-back-walk-3.png",
            "images/player/player-back-walk-2.png"
        ]
    },

    right: {
        idle: "images/player/player-right.png",

        walk: [
            "images/player/player-right-walk-1.png",
            "images/player/player-right-walk-2.png",
            "images/player/player-right-walk-3.png",
            "images/player/player-right-walk-2.png"
        ]
    },

    left: {
        idle: "images/player/player-right.png",

        walk: [
            "images/player/player-right-walk-1.png",
            "images/player/player-right-walk-2.png",
            "images/player/player-right-walk-3.png",
            "images/player/player-right-walk-2.png"
        ]
    }

};


let playerAnimationTimer = 0;
let playerAnimationFrame = 0;
let lastAnimationDirection = "down";


function getPlayerDirection() {

    if (
        player.classList.contains("facing-up")
    ) {
        return "up";
    }

    if (
        player.classList.contains("facing-left")
    ) {
        return "left";
    }

    if (
        player.classList.contains("facing-right")
    ) {
        return "right";
    }

    return "down";
}


function updatePlayerSpriteAnimation(deltaTime) {

    const direction =
        getPlayerDirection();

    const isMoving =
        player.classList.contains("moving");

    const spriteSet =
        PLAYER_SPRITES[direction];


    // Reset animation when direction changes
    if (
        direction !== lastAnimationDirection
    ) {

        playerAnimationFrame = 0;
        playerAnimationTimer = 0;

        lastAnimationDirection =
            direction;
    }


    // Standing still
    if (!isMoving) {

        playerAnimationFrame = 0;
        playerAnimationTimer = 0;

        playerSprite.src =
            spriteSet.idle;

    }

    // Walking
    else {

        playerAnimationTimer +=
            deltaTime;

        if (
            playerAnimationTimer >=
            PLAYER_FRAME_TIME
        ) {

            playerAnimationTimer -=
                PLAYER_FRAME_TIME;

            playerAnimationFrame =
                (
                    playerAnimationFrame + 1
                ) %
                spriteSet.walk.length;
        }

        playerSprite.src =
            spriteSet.walk[
                playerAnimationFrame
            ];
    }


    // Mirror RIGHT sprites when walking left
    if (direction === "left") {

        playerSprite.style.transform =
            "scaleX(-1)";

    }

    else {

        playerSprite.style.transform =
            "scaleX(1)";
    }
}



function movePlayer(deltaTime) {

    let horizontal = 0;

    let vertical = 0;

    let isMoving = false;


    if (
        pressedKeys.has("a") ||
        pressedKeys.has("arrowleft")
    ) {

        horizontal -= 1;

    }


    if (
        pressedKeys.has("d") ||
        pressedKeys.has("arrowright")
    ) {

        horizontal += 1;

    }


    if (
        pressedKeys.has("w") ||
        pressedKeys.has("arrowup")
    ) {

        vertical -= 1;

    }


    if (
        pressedKeys.has("s") ||
        pressedKeys.has("arrowdown")
    ) {

        vertical += 1;

    }


    // Not moving.

   if (
    horizontal === 0 &&
    vertical === 0
) {

    player.classList.remove("moving");

    return;

}


isMoving = true;


if (isMoving) {

    player.classList.add("moving");

}
// ======================================================
// PLAYER FACING DIRECTION
// ======================================================

player.classList.remove(
    "facing-up",
    "facing-down",
    "facing-left",
    "facing-right"
);


if (
    Math.abs(horizontal) >
    Math.abs(vertical)
) {

    if (horizontal < 0) {

        player.classList.add(
            "facing-left"
        );

    }

    else {

        player.classList.add(
            "facing-right"
        );

    }

}

else {

    if (vertical < 0) {

        player.classList.add(
            "facing-up"
        );

    }

    else {

        player.classList.add(
            "facing-down"
        );

    }

}


    // Normalize diagonal movement so diagonal isn't faster.

    if (
        horizontal !== 0 &&
        vertical !== 0
    ) {

        const diagonalScale =
            1 / Math.sqrt(2);


        horizontal *=
            diagonalScale;


        vertical *=
            diagonalScale;

    }


    const roomRect =
        room.getBoundingClientRect();


    const seconds =
        deltaTime / 1000;


    const horizontalPercent =
        (
            PLAYER_SPEED /
            roomRect.width
        ) *
        100 *
        seconds;


    const verticalPercent =
        (
            PLAYER_SPEED /
            roomRect.height
        ) *
        100 *
        seconds;


    // ======================================================
// MOVE PLAYER
//
// Horizontal and vertical movement are handled
// separately so the player cannot become trapped
// against the slanted floor boundaries.
// ======================================================


// ------------------------------------------------------
// HORIZONTAL MOVEMENT
// ------------------------------------------------------

if (horizontal !== 0) {

    let candidateX =
        playerX +
        horizontal *
        horizontalPercent;


    const horizontalBounds =
        getFloorBounds(playerY);


    candidateX =
        Math.max(
            horizontalBounds.minX,
            Math.min(
                horizontalBounds.maxX,
                candidateX
            )
        );


    if (
        !collidesWithFurniture(
            candidateX,
            playerY
        )
    ) {

        playerX =
            candidateX;

    }

}


// ------------------------------------------------------
// VERTICAL MOVEMENT
// ------------------------------------------------------

if (vertical !== 0) {

    let candidateY =
        playerY +
        vertical *
        verticalPercent;


    const verticalBounds =
        getFloorBounds(candidateY);


    candidateY =
        Math.max(
            verticalBounds.minY,
            Math.min(
                verticalBounds.maxY,
                candidateY
            )
        );


    // If moving farther toward the back causes the
    // trapezoid to become narrower, gently slide the
    // player inward rather than trapping them.

    let adjustedX =
        Math.max(
            verticalBounds.minX,
            Math.min(
                verticalBounds.maxX,
                playerX
            )
        );


    if (
        !collidesWithFurniture(
            adjustedX,
            candidateY
        )
    ) {

        playerX =
            adjustedX;


        playerY =
            candidateY;

    }

}


updatePlayerPosition();

}



// ==========================================================
// PROXIMITY / INTERACTION
// ==========================================================

let nearbyObject = null;



function updateNearbyObject() {

    const roomRect =
        room.getBoundingClientRect();


    // Convert the player's percentage position
    // into an actual pixel position in the room.

    const playerCenterX =
        roomRect.left +
        (playerX / 100) *
        roomRect.width;


    const playerCenterY =
        roomRect.top +
        (playerY / 100) *
        roomRect.height;


    let closestObject = null;
    let closestDistance = Infinity;

    let closestCustomObject = null;
    let closestCustomDistance = Infinity;


    roomObjects.forEach((object) => {

        let distance;


        // ==================================================
        // WALL OBJECTS
        //
        // About, Experience, and Skills have custom
        // interaction points on the floor.
        // ==================================================

        if (
            object.dataset.interactX &&
            object.dataset.interactY
        ) {

            const interactX =
                Number(object.dataset.interactX);

            const interactY =
                Number(object.dataset.interactY);


            const targetX =
                roomRect.left +
                (interactX / 100) *
                roomRect.width;


            const targetY =
                roomRect.top +
                (interactY / 100) *
                roomRect.height;


            const dx =
                playerCenterX -
                targetX;


            const dy =
                playerCenterY -
                targetY;


            distance =
                Math.hypot(dx, dy);


            const customInteractionRange = 95;


            if (
                distance <
                    customInteractionRange &&
                distance <
                    closestCustomDistance
            ) {

                closestCustomObject =
                    object;


                closestCustomDistance =
                    distance;

            }

        }

        else {

            // ==================================================
            // FLOOR OBJECTS
            //
            // Projects, Resume, Interests, and Contact use
            // distance to the NEAREST EDGE of their visual.
            // ==================================================

            const visual =
                object.firstElementChild;


            if (!visual) {
                return;
            }


            const rect =
                visual.getBoundingClientRect();


            const closestX =
                Math.max(
                    rect.left,
                    Math.min(
                        playerCenterX,
                        rect.right
                    )
                );


            const closestY =
                Math.max(
                    rect.top,
                    Math.min(
                        playerCenterY,
                        rect.bottom
                    )
                );


            const dx =
                playerCenterX -
                closestX;


            const dy =
                playerCenterY -
                closestY;


            distance =
                Math.hypot(dx, dy);


            const interactionRange = 90;


            if (
                distance <
                    interactionRange &&
                distance <
                    closestDistance
            ) {

                closestObject =
                    object;


                closestDistance =
                    distance;

            }

        }

    });


    // Wall interaction points get priority when active.

    nearbyObject =
        closestCustomObject ||
        closestObject;


    // ======================================================
    // HIGHLIGHT NEARBY ROOM OBJECT
    // ======================================================

    roomObjects.forEach((object) => {

        object.classList.toggle(
            "nearby-object",
            object === nearbyObject
        );

    });


    // ======================================================
    // HIGHLIGHT MATCHING SIDEBAR ITEM
    // ======================================================

    menuLinks.forEach((link) => {

        const matchesNearbyObject =
            nearbyObject &&
            link.dataset.section ===
                nearbyObject.dataset.section;


        link.classList.toggle(
            "nearby-menu",
            matchesNearbyObject
        );

    });


    // ======================================================
    // SHOW / HIDE INTERACTION PROMPT
    // ======================================================

    if (nearbyObject) {

        const sectionId =
            nearbyObject.dataset.section;


        // Position the prompt above the visual object.

        const visual =
            nearbyObject.firstElementChild;


        if (visual) {

            const visualRect =
                visual.getBoundingClientRect();


            const promptX =
                (
                    (
                        visualRect.left +
                        visualRect.width / 2 -
                        roomRect.left
                    ) /
                    roomRect.width
                ) *
                100;


            const promptY =
                (
                    (
                        visualRect.top -
                        roomRect.top
                    ) /
                    roomRect.height
                ) *
                100;


            interactionPrompt.style.left =
                `${promptX}%`;


            interactionPrompt.style.top =
                `${promptY}%`;

        }


        interactionText.textContent =
            sectionNames[sectionId];


        interactionPrompt.classList.add(
            "visible"
        );


        interactionPrompt.setAttribute(
            "aria-hidden",
            "false"
        );

    }

    else {

        interactionPrompt.classList.remove(
            "visible"
        );


        interactionPrompt.setAttribute(
            "aria-hidden",
            "true"
        );

    }

}


// ==========================================================
// GAME LOOP
// ==========================================================

let previousTime =
    performance.now();

// ==========================================================
// ROOM DEPTH SORTING
//
// Objects lower in the room appear in front of objects
// that are higher in the room.
//
// This helps create the 2.5D illusion.
// ==========================================================

function updateDepthSorting() {

    const roomRect =
        room.getBoundingClientRect();


    // ------------------------------------------------------
    // PLAYER DEPTH
    // ------------------------------------------------------

    const playerDepth =
        Math.round(playerY * 10);


    player.style.zIndex =
        playerDepth;


    // ------------------------------------------------------
    // FURNITURE DEPTH
    // ------------------------------------------------------

    roomObjects.forEach((object) => {

        const visual =
            object.firstElementChild;


        if (!visual) {
            return;
        }


        const rect =
            visual.getBoundingClientRect();


        // Use the bottom edge of the object as its
        // "feet" position in the room.

        const objectBottom =
            rect.bottom -
            roomRect.top;


        const objectYPercent =
            (
                objectBottom /
                roomRect.height
            ) *
            100;


        const objectDepth =
            Math.round(
                objectYPercent * 10
            );


        object.style.zIndex =
            objectDepth;

    });

}

function gameLoop(currentTime) {

    // Prevent huge movement jumps if browser tab
    // temporarily becomes inactive.

    const deltaTime =
        Math.min(
            currentTime -
            previousTime,
            35
        );


    previousTime =
        currentTime;


    if (
    !portfolioPanel.classList.contains(
        "open"
    )
) {

    movePlayer(deltaTime);

    updatePlayerSpriteAnimation(
        deltaTime
    );

    updateNearbyObject();

    updateDepthSorting();

}


    requestAnimationFrame(
        gameLoop
    );

}



// ==========================================================
// START GAME
// ==========================================================

updatePlayerPosition();

updateNearbyObject();

updateDepthSorting();

requestAnimationFrame(
    gameLoop
);