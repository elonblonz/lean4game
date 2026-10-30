import * as React from 'react';

import { Button, Dialog, DialogContent, DialogContentText, DialogActions } from '@mui/material';
import { Markdown } from './markdown';

function Message({ isOpen, content, close }: { isOpen: boolean, content: string, close: () => void }) {

  return (
    <Dialog open={isOpen} onClose={close}>
      <DialogContent>
        <DialogContentText id="alert-dialog-description">
          <Markdown>{content}</Markdown>
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={close} autoFocus={true} disableFocusRipple>
          Ok
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default Message
