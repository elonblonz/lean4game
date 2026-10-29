import * as React from 'react'
import { IconDefinition } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { buttonProps } from "../../utils/a11y"

/** A button to appear in the navigation (both, top bar or dropdown). */
export const NavButton: React.FC<{
  icon?: IconDefinition
  iconElement?: JSX.Element
  text?: string
  onClick?: React.MouseEventHandler<HTMLAnchorElement>
  title?: string
  href?: string
  inverted?: boolean
  disabled?: boolean
  className?: string
}> = ({icon, iconElement, text, onClick=()=>{}, title, href=undefined, inverted=false, disabled=false, className=''}) => {
  // Without a link it acts as a button: make it one for the keyboard and screen readers too.
  const asButton = href === undefined ? {
    ...buttonProps(ev => onClick(ev as React.MouseEvent<HTMLAnchorElement>), disabled),
    "aria-label": text ? undefined : title,
  } : {}
  return <a
    className={`${className} nav-button btn${inverted?' btn-inverted':''}${disabled?' btn-disabled':''}`}
    onClick={ (ev) => {if(!disabled) onClick(ev) }}
    href={(!disabled) ? href : undefined} title={title}
    {...asButton}>
    {iconElement ?? (icon && <FontAwesomeIcon icon={icon} />)}{text && <>&nbsp;{text}</>}
  </a>
}
