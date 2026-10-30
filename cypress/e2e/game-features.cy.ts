// cypress/e2e/basic-game-features.cy.ts
// Tests for basic game functionality using the simple TestGame

describe('Basic Lean4Game Features', () => {
  beforeEach(() => {
    // Handle Lean server timeout errors
    cy.on('uncaught:exception', (err) => {
      if (err.message.includes('Stopping the server timed out') ||
          err.message.includes('timeout') ||
          err.message.includes('WebSocket') ||
          err.message.includes('Socket') ||
          err.message.includes('Connection')) {
        return false
      }
      return true
    })

    // Desktop layout: narrower windows get the mobile layout (see `AUTO_SWITCH_THRESHOLD`).
    cy.viewport(1280, 800)

    // Navigate to test game before each test
    cy.visit('/#/g/test/TestGame')
    cy.contains('This is the introduction text of the game.', { timeout: 15000 })
  })

  // Helper function to navigate to introduction page
  const navigateToIntroduction = () => {
    cy.contains('Test World').click({ force: true })
    cy.url().should('include', '/level/0')  // Wait for navigation
  }

  // Helper function to navigate to level
  const navigateToLevel = () => {
    navigateToIntroduction()
    cy.contains('Start').click()
    cy.contains('Assumptions:', { timeout: 60000 })
  }

  describe('Navigation and UI Structure', () => {
    it('should navigate to world introduction via Test World button', () => {
      navigateToIntroduction()

      // Check we're on the introduction page with correct title
      cy.contains('Introduction').should('be.visible')
      cy.contains('This is the introduction of Test World.')
    })

    it('should navigate to world introduction via level 1 button', () => {
      // Click on level 1 directly
      cy.contains('1').click({ force: true })
      cy.url().should('include', '/level/0')  // Wait for navigation

      // Check we're on the introduction page with correct title
      cy.contains('Introduction').should('be.visible')
      cy.contains('This is the introduction of Test World.')
    })

    it('should navigate from introduction to level', () => {
      navigateToLevel()

      // Verify we're in the level with Monaco editor and goal
      cy.get('.monaco-editor').should('be.visible')
      cy.contains('Active Goal').should('be.visible')
    })
  })

  describe('Hints and Progressive Guidance', () => {
    it('should show initial hint after starting level', () => {
      navigateToLevel()

      // Check for the initial hint (should be the only hint visible)
      cy.contains('You can either start using').should('be.visible')

      // Verify no other hints are shown initially
      cy.contains('You should use g now').should('not.exist')
    })

    it('should show progressive hint after first tactic', () => {
      navigateToLevel()

      // Enter first tactic
      cy.get('.typewriter-input .monaco-editor .view-lines').type('rw [g]{enter}')

      // Wait for the goal state to update after first tactic
      cy.contains('x + x = 4', { timeout: 10000 }).should('be.visible')

      // Check that the progressive hint appears
      cy.contains('Maybe you should use h now').should('be.visible')
    })

    it('should show goal and hint in editor mode', () => {
      navigateToLevel()

      cy.get(".fa-code").click()

      // The goal is in Lean's infoview (an iframe), the hints stay in the chat.
      cy.frameLoaded('.infoview iframe')
      cy.iframe('.infoview iframe').contains('unsolved goals', { timeout: 30000 })
      cy.iframe('.infoview iframe').contains('x + x = y')
      cy.get('.chat').contains('You can either start using h or g.')

      cy.get('.codeview').type('rw [h]{enter}')

      cy.iframe('.infoview iframe').contains('2 + 2 = y', { timeout: 30000 })
      cy.get('.chat').contains('You should use g now.', { timeout: 30000 })

      // The infoview follows the cursor.
      cy.focused().type('{uparrow}{uparrow}')
      cy.iframe('.infoview iframe').contains('x + x = y')
    })
  })

  describe('Tactics Panel and Documentation', () => {
    it('should display tactics panel with rfl and rw buttons', () => {
      navigateToLevel()

      // Check that tactics section exists, open it
      cy.get('.inventory').within(() => {
        cy.contains('Tactics').should('be.visible').click()
      })

      // Check for the specific tactics buttons
      cy.get('.inventory').within(() => {
        cy.contains('rfl').should('be.visible')
        cy.contains('rw').should('be.visible')
      })
    })

    it('should show tactic documentation when clicked', () => {
      navigateToLevel()
      cy.get('.inventory').within(() => {
        cy.contains('rfl').click()
      })
      cy.get('.documentation').within(() => {
        cy.contains('The way to proof reflexivity').should('be.visible')
      })
    })

    it('should show theorem documentation when clicked', () => {
      navigateToLevel()
      cy.get('.inventory').within(() => {
        cy.contains('Theorems').click()
        cy.contains('add_comm').click()
      })
      cy.get('.documentation').within(() => {
        cy.contains('Commutativity').should('be.visible')
      })
    })

    it('should show definition documentation when clicked', () => {
      navigateToLevel()
      cy.get('.inventory').within(() => {
        cy.contains('Definitions').click()
        cy.contains('==').click()
        cy.contains('equality').click()
      })
      cy.get('.documentation').within(() => {
        cy.contains('An equality').should('be.visible')
      })
    })
  })

  describe('Tactic Input and Goal Updates', () => {
    it('should accept tactic input and update goal state', () => {
      navigateToLevel()

      // Use typewriter interface (blue box at bottom)
      cy.get('.typewriter-input .monaco-editor .view-lines').type('rw [h]{enter}')

      // Wait for Lean to process the tactic
      // Should show updated goal state (proving the tactic was processed)
      cy.contains('2 + 2 = y', { timeout: 10000 }).should('be.visible')
    })

    it('should show error message when using invalid tactic call', () => {
      navigateToLevel()

      // Use typewriter interface to enter an invalid tactic
      cy.get('.typewriter-input .monaco-editor .view-lines').type('rw [x]{enter}')

      // Wait for the error message to appear
      cy.contains("Invalid rewrite argument")
    })
  })

  describe('Level Completion', () => {
    it('should complete the test level with proper solution', () => {
      navigateToLevel()

      // Solve the level step by step (based on the Lean file)
      cy.get('.typewriter-input .monaco-editor .view-lines').type('rw [h]{enter}')

      // Wait for the goal state to update after first tactic
      cy.contains('2 + 2 = y', { timeout: 10000 }).should('be.visible')

      // Enter second tactic
      cy.get('.typewriter-input .monaco-editor .view-lines').type('rw [g]{enter}')

      // Look for the completion message from the Lean file
      cy.contains('This last message appears if the level is solved.', { timeout: 60000 })
    })
  })


  describe('Unsolved Goals', () => {
    it('should show unsolved goals only in editor mode', () => {
      navigateToLevel()

      // Solve the level step by step (based on the Lean file)
      cy.get('.typewriter-input .monaco-editor .view-lines').type('rw [h]{enter}')

      // Wait for the goal state to update after first tactic
      cy.contains('2 + 2 = y', { timeout: 10000 }).should('be.visible')
      cy.contains('unsolved goals').should('not.exist')

      cy.get(".fa-code").click()
      // The infoview shows the messages at the cursor: Lean reports the error at the end.
      cy.get('.codeview').type('{ctrl+end}')
      cy.frameLoaded('.infoview iframe')
      cy.iframe('.infoview iframe').contains('unsolved goals', { timeout: 30000 }).should('be.visible')
    })
  })

  describe('Hypothesis Names', () => {
    it('Should use player\'s hypothesis names in hints', () => {
      cy.visit('/#/g/test/TestGame/world/TestWorld/level/2')
      cy.contains('Assumptions:', { timeout: 60000 })

      cy.get('.typewriter-input .monaco-editor .view-lines').type('have myname : x + z = y + z := by rw [h]{enter}')

      // Check that the hint uses the player's hypothesis name `myname`
      cy.contains('You should use myname now')
    })
  })

  describe('Non-Prop Level', () => {
    it('Non-prop statements should be allowed', () => {
      cy.visit('/#/g/test/TestGame/world/TestWorld/level/3')
      cy.get('.goal-sign', { timeout: 60000 }).should('be.visible')
      //cy.contains('Goal:', { timeout: 60000 })
      cy.contains('intro first!')
      cy.get('.typewriter-input .monaco-editor .view-lines').type('intro x{enter}')
      cy.contains('now apply!', { timeout: 10000 })
      cy.get('.typewriter-input .monaco-editor .view-lines').type('apply x{enter}')
      cy.contains('Done!', { timeout: 10000 })
    })
  })

  describe('Settings and Preferences', () => {
    it('should open preferences popup', () => {
      // Click menu button to open dropdown
      cy.get('#menu-btn').click()

      // Click preferences
      cy.contains('Preferences').click()

      // Check preferences popup opened
      cy.get('.MuiSlider-root').should('be.visible')

      // Close popup
      cy.get('body').click(0, 0)
    })

    it('should change language of hints to selected language if translation is available', () => {
      navigateToLevel()
      // Click menu button to open dropdown
      cy.get('#menu-btn').click()

      // Click preferences
      cy.contains('Preferences').click()

      // Select german language
      // the first select is the language
      cy.get('.MuiSelect-select').first().click()
      cy.get('.MuiPaper-root').click()
      cy.get('li[data-value="de"]').click()

      // Close preferences
      cy.get('.modal-close').click()

      // Check that displayed language is german
      cy.contains('Du kannst mit h oder g starten.').should('be.visible')
    })

    it('should render an intentionally empty game translation', () => {
      cy.get('#menu-btn').click()
      cy.contains('Preferences').click()
      // the first select is the language
      cy.get('.MuiSelect-select').first().click()
      cy.get('li[data-value="de"]').click({ force: true })
      cy.get('.modal-close').click()

      cy.contains('This is the introduction text of the game.').should('not.exist')
      cy.get('.chat-panel .hint').should('not.exist')
    })

    it('should not change language of hints to selected language if translation is not available', () => {
      navigateToLevel()
      // Click menu button to open dropdown
      cy.get('#menu-btn').click()

      // Click preferences
      cy.contains('Preferences').click()

      // Select mandarin language
      // the first select is the language
      cy.get('.MuiSelect-select').first().click()
      cy.get('.MuiPaper-root').click()
      cy.get('li[data-value="zh"]').click()

      // Close preferences
      cy.get('.modal-close').click()

      // Check that displayed language is english
      cy.contains('You can either start using h or g.').should('be.visible')
    })
  })

  // The typewriter's command line. Type into Monaco's input itself: right after a level opens,
  // clicking the editor doesn't always give it the focus in time.
  const typeCommand = (command: string) =>
    cy.get('.typewriter-input .monaco-editor textarea').focus().type(`${command}{enter}`)

  // Solve level 1 of the test game (from inside the level)
  const solveLevel1 = () => {
    typeCommand('rw [h]')
    cy.contains('2 + 2 = y', { timeout: 30000 }).should('be.visible')
    typeCommand('rw [g]')
    cy.contains('Level completed!', { timeout: 60000 })
  }

  describe('Level Navigation', () => {
    it('should move between levels with the app bar', () => {
      // With the default rules, "Next" needs the level to be solved: start at level 2.
      cy.visit('/#/g/test/TestGame/world/TestWorld/level/2')
      cy.contains('Assumptions:', { timeout: 60000 })
      cy.get('.app-bar').contains('Level 2 / 3')
      cy.contains('Hypothesis Names')

      cy.get('.app-bar').find('[title="previous level"]').click()
      cy.url().should('include', '/world/TestWorld/level/1')
      cy.get('.app-bar').contains('Level 1 / 3')
      // The new level is announced to screen readers.
      cy.get('[role="status"]').should('contain', 'Level 1 / 3')
      cy.contains('Assumptions:', { timeout: 60000 })
      cy.get('.app-bar').find('[title="next level"]').should('be.disabled')

      solveLevel1()
      cy.get('.app-bar').find('[title="next level"]').should('not.be.disabled')
      // The Next button below the hints gets the focus.
      cy.focused().should('contain', 'Next').click()
      cy.url().should('include', '/world/TestWorld/level/2')
      cy.contains('Assumptions:', { timeout: 60000 })

      cy.get('#home-btn').click()
      cy.url().should('match', /#\/g\/test\/TestGame$/)
      cy.contains('This is the introduction text of the game.')
    })

    it('should navigate the world map with the keyboard', () => {
      cy.get('svg .world[role="button"]').first().focus()
      cy.focused().should('have.attr', 'aria-label').and('contain', 'Test World')
      // The arrow keys move from the world to its levels.
      cy.focused().type('{rightarrow}')
      cy.focused().should('have.attr', 'aria-label').and('contain', 'Level 1')
      // Enter opens it: the world's introduction, which hasn't been read yet.
      cy.focused().type('{enter}')
      cy.url().should('include', '/world/TestWorld/level/0')
      cy.contains('This is the introduction of Test World.')
    })
  })

  describe('Hints Appearing', () => {
    it('should show a new hint in the chat after a command', () => {
      cy.visit('/#/g/test/TestGame/world/TestWorld/level/1')
      cy.contains('Assumptions:', { timeout: 60000 })
      cy.get('.chat[role="log"]').within(() => {
        cy.contains('You can either start using h or g.').should('be.visible')
        cy.contains('You should use g now.').should('not.exist')
      })
      typeCommand('rw [h]')
      cy.get('.chat[role="log"]').contains('You should use g now.', { timeout: 30000 }).should('be.visible')
    })
  })

  describe('Inventory', () => {
    it('should unlock the level\'s tactics once it is solved', () => {
      // Before: locked in the game's inventory on the welcome page.
      cy.get('.inventory').contains('.item', 'rw').should('have.class', 'locked')
        .and('have.attr', 'aria-label').and('contain', 'Not unlocked yet')

      cy.visit('/#/g/test/TestGame/world/TestWorld/level/1')
      cy.contains('Assumptions:', { timeout: 60000 })
      solveLevel1()

      cy.get('#home-btn').click()
      cy.get('.inventory').contains('.item', 'rw').should('not.have.class', 'locked')
      cy.get('.inventory').contains('.item', 'rfl').should('not.have.class', 'locked')
      // ... and in the world's introduction.
      cy.visit('/#/g/test/TestGame/world/TestWorld/level/0')
      cy.get('.inventory').contains('.item', 'rw').should('not.have.class', 'locked')
    })

    it('should be usable with the keyboard', () => {
      cy.visit('/#/g/test/TestGame/world/TestWorld/level/1')
      cy.contains('Assumptions:', { timeout: 60000 })
      // The tabs: arrow keys move, Enter selects.
      cy.get('.inventory .tab-bar.major [role="tab"][aria-selected="true"]').should('contain', 'Tactics').focus()
      cy.focused().type('{leftarrow}')
      cy.focused().should('contain', 'Theorems').type('{enter}')
      cy.get('.inventory .tab-bar.major [role="tab"][aria-selected="true"]').should('contain', 'Theorems')
      // An item opens its doc with Enter, Escape closes it and gives the focus back.
      cy.get('.inventory').contains('[role="button"]', 'add_comm').focus().type('{enter}')
      cy.get('.documentation').contains('Commutativity').should('be.visible')
      cy.focused().type('{esc}')
      cy.get('.documentation').should('not.exist')
      cy.focused().should('contain', 'add_comm')
    })
  })

  describe('Written Proof', () => {
    it('should write out a completed proof', () => {
      cy.visit('/#/g/test/TestGame/world/TestWorld/level/1')
      cy.contains('Assumptions:', { timeout: 60000 })
      typeCommand('rw [h]')
      cy.contains('2 + 2 = y', { timeout: 30000 })
      // Only completed proofs are written out.
      cy.get('.written-proof').should('not.exist')

      typeCommand('rw [g]')
      cy.contains('Level completed!', { timeout: 60000 })
      cy.get('.written-proof', { timeout: 30000 }).should('contain', 'Your proof, written out')
      cy.get('.written-proof-qed').should('contain', '∎')
    })

    it('should collect completed proofs in "My proofs"', () => {
      cy.visit('/#/g/test/TestGame/world/TestWorld/level/1')
      cy.contains('Assumptions:', { timeout: 60000 })
      typeCommand('rw [h]')
      typeCommand('rw [g]')
      cy.contains('Level completed!', { timeout: 60000 })
      cy.get('.written-proof', { timeout: 30000 }).contains('All my proofs').click()
      cy.get('[role="dialog"]').should('contain', 'Every proof you have completed, written out.')
        .find('.written-proof').should('have.length', 1)
    })
  })

  describe('Hint Ladder', () => {
    it('should reveal hidden hints one at a time', () => {
      cy.visit('/#/g/test/TestGame/world/TestWorld/level/1')
      cy.contains('Assumptions:', { timeout: 60000 })
      cy.get('.chat').should('not.contain', 'Idea: replace x by its value.')

      cy.get('.chat-panel').contains('button', 'Show more help!').click()
      cy.get('.chat').contains('Idea: replace x by its value.').should('be.visible')
      cy.get('.chat').should('not.contain', 'Next step: rewrite with h.')
      cy.get('.chat .hint-rung').should('contain', 'Hint 1 of 3')

      cy.get('.chat-panel').contains('button', 'Next hint (2 of 3)').click()
      cy.get('.chat').contains('Next step: rewrite with h.').should('be.visible')
      cy.get('.chat').should('not.contain', 'Specific move')

      cy.get('.chat-panel').contains('button', 'Next hint (3 of 3)').click()
      cy.get('.chat').contains('Specific move: type rw [h].').should('be.visible')
      cy.get('.chat-panel').contains('button', /Show more help|Next hint/).should('not.exist')

      // The revealed hints are saved with the progress.
      cy.reload()
      cy.contains('Assumptions:', { timeout: 60000 })
      cy.get('.chat').contains('Specific move: type rw [h].').should('be.visible')
      cy.get('.chat').find('.hidden-hint').should('have.length', 3)
    })
  })

  describe('Glossary', () => {
    it('should search the docs of tactics, theorems and definitions', () => {
      cy.visit('/#/g/test/TestGame/world/TestWorld/level/1')
      cy.contains('Assumptions:', { timeout: 60000 })
      cy.get('.inventory .view-switch').contains('[role="tab"]', 'Glossary').click()
      cy.get('.glossary').should('be.visible')
      cy.get('.inventory .tab-bar.major').should('not.exist')

      // Unlocked in this level: rw and rfl, add_comm, equality and +.
      cy.get('.glossary-list').should('contain', 'rw').and('contain', 'add_comm').and('contain', 'equality')
      cy.get('.glossary-list').should('not.contain', 'intro')

      // Searches the doc texts, too.
      cy.get('.glossary-search').type('rewrites')
      cy.get('.glossary-entry').should('have.length', 1).find('summary').click()
      cy.get('.glossary-entry').should('contain', 'Rewrites the goal with an equation.')
        .and('contain', 'In a written proof:')
      cy.get('.glossary-search').clear().type('zzzz')
      cy.get('.glossary-entry').should('not.exist')
      cy.get('.glossary-count').should('contain', '0 entries')

      // Items still to come, on request.
      cy.get('.glossary-search').clear()
      cy.get('.glossary-locked input').check()
      cy.get('.glossary-entry.locked').should('contain', 'intro')

      cy.get('.inventory .view-switch').contains('[role="tab"]', 'Inventory').click()
      cy.get('.inventory .tab-bar.major').should('be.visible')
    })
  })

  describe('World Recap', () => {
    const solved = { code: '', selections: [], completed: true, help: [] }

    // Levels 2 and 3 solved: solving level 1 completes the world.
    const almostDone = () => {
      cy.window().then(win => win.localStorage.setItem('game_progress', JSON.stringify({ games: {
        'g/test/TestGame': { inventory: [], difficulty: 2, readIntro: true, data: {
          TestWorld: { readIntro: true, 2: solved, 3: { ...solved, notes: 'intro, then apply' } } } } } })))
      cy.visit('/#/g/test/TestGame/world/TestWorld/level/1')
      cy.reload()
      cy.contains('Assumptions:', { timeout: 60000 })
    }

    it('should show the recap when the world is completed', () => {
      almostDone()
      cy.get('[role="dialog"]').should('not.exist')
      solveLevel1()

      cy.get('[role="dialog"]').should('be.visible').within(() => {
        cy.contains('h2', 'World recap: Test World')
        cy.contains('What you learned')
        cy.get('.recap-techniques').should('contain', 'rw').and('contain', 'intro').and('contain', 'equality')
        cy.get('.recap-level').should('have.length', 3)
        cy.get('.recap-level').eq(2).find('textarea').should('have.value', 'intro, then apply')
        cy.get('.recap-level').eq(1).find('textarea').type('have, then exact')
      })
      cy.window().then(win => {
        const progress = JSON.parse(win.localStorage.getItem('game_progress')!)
        expect(progress.games['g/test/TestGame'].data.TestWorld[2].notes).to.equal('have, then exact')
      })

      // A technique links to the level that introduced it.
      cy.get('.recap-techniques').contains('li', 'intro').find('a').click()
      cy.get('[role="dialog"]').should('not.exist')
      cy.url().should('include', '/world/TestWorld/level/3')
      // The level's notes are there, too.
      cy.get('.level-notes textarea').should('have.value', 'intro, then apply')
    })

    it('should replay a level without hints', () => {
      almostDone()
      solveLevel1()
      cy.get('[role="dialog"]').within(() => {
        cy.get('.recap-level').eq(0).contains('button', 'Replay without hints').click()
      })
      cy.get('[role="dialog"]').should('not.exist')
      // The proof starts again, without hints, and the level stays solved.
      cy.get('.chat').contains('You are replaying this level without hints.', { timeout: 30000 })
      cy.get('.chat').should('not.contain', 'You can either start using h or g.')
      cy.get('.chat-panel').contains('button', 'Show more help!').should('not.exist')
      cy.get('.written-proof').should('not.exist')
      cy.get('.app-bar').find('[title="next level"]').should('not.be.disabled')

      // Solving it ends the replay.
      solveLevel1()
      cy.get('.chat').should('not.contain', 'You are replaying this level without hints.')
      cy.get('.chat').contains('You should use g now.')
    })

    it('should show the hints again on request', () => {
      almostDone()
      solveLevel1()
      cy.get('[role="dialog"]').find('.recap-level').first().contains('button', 'Replay without hints').click()
      cy.get('.chat').contains('button', 'Show hints').click()
      cy.get('.chat').contains('You can either start using h or g.').should('be.visible')
      cy.get('.chat').should('not.contain', 'You are replaying this level without hints.')
      // The world's introduction offers the recap, too.
      cy.visit('/#/g/test/TestGame/world/TestWorld/level/0')
      cy.contains('button', 'World recap').click()
      cy.get('[role="dialog"]').contains('h2', 'World recap: Test World')
    })
  })

  describe('Appearance', () => {
    it('should switch to dark mode', () => {
      cy.get('html').should('have.attr', 'data-theme', 'light')
      cy.get('#menu-btn').click()
      cy.contains('Preferences').click()
      cy.get('[role="dialog"]').should('have.attr', 'aria-labelledby')
      cy.contains('.preferences-category', 'Appearance').find('.MuiSelect-select').first().click()
      cy.get('li[data-value="dark"]').click()
      cy.get('html').should('have.attr', 'data-theme', 'dark')
      cy.get('body').should('have.css', 'background-color', 'rgb(15, 17, 21)')
      // Escape closes the popup.
      cy.get('body').type('{esc}')
      cy.get('[role="dialog"]').should('not.exist')
      // The setting is saved.
      cy.reload()
      cy.contains('This is the introduction text of the game.', { timeout: 15000 })
      cy.get('html').should('have.attr', 'data-theme', 'dark')
    })

    it('should turn off animations when asked to', () => {
      cy.get('html').should('have.attr', 'data-reduced-motion')
      cy.get('#menu-btn').click()
      cy.contains('Preferences').click()
      cy.contains('.preferences-item', 'Animations').find('.MuiSelect-select').click()
      cy.get('li[data-value="reduce"]').click()
      cy.get('html').should('have.attr', 'data-reduced-motion', 'true')
      cy.get('.modal-close').click()
      cy.get('.btn').first().should('have.css', 'transition-duration', '1e-05s')
    })
  })

  describe('Mobile Viewport', () => {
    it('should show the level one panel at a time', () => {
      cy.viewport(390, 844)
      cy.visit('/#/g/test/TestGame/world/TestWorld/level/1')
      cy.get('.app-bar.mobile').should('be.visible')
      cy.get('.level-mobile').should('exist')
      cy.contains('Assumptions:', { timeout: 60000 }).should('be.visible')
      // On mobile, the hints are shown inside the proof.
      cy.contains('You can either start using h or g.').should('be.visible')

      cy.get('.mobile-page-switch').contains('[role="tab"]', 'Inventory').click()
      cy.get('#level-page-inventory').should('be.visible')
      cy.get('#level-page-proof').should('not.be.visible')
      cy.get('.inventory').contains('rw').should('be.visible')

      cy.get('.mobile-page-switch').contains('[role="tab"]', 'Proof')
        .should('have.attr', 'aria-selected', 'false').click()
      cy.get('#level-page-proof').should('be.visible')
      typeCommand('rw [h]')
      cy.contains('You should use g now.', { timeout: 30000 }).should('be.visible')
    })

    it('should page through the welcome page', () => {
      cy.viewport(390, 844)
      cy.get('.welcome.mobile').should('exist')
      cy.get('.welcome.mobile').contains('Start').click()
      cy.get('svg .world[role="button"]').should('be.visible')
    })
  })
})
