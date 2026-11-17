"use client"
import {useState,type InputHTMLAttributes} from "react"
export function MoneyInput({value,onValueChange,...props}:Omit<InputHTMLAttributes<HTMLInputElement>,"value"|"onChange">&{value:string|undefined;onValueChange:(value:string)=>void}){
 const [text,setText]=useState<string|null>(null)
 const display=!value||Number(value)===0?"":value
 return <input {...props} inputMode="decimal" placeholder="0.00" value={text??display} onFocus={()=>setText(display)} onBlur={()=>setText(null)} onChange={event=>{setText(event.target.value);onValueChange(event.target.value||"0")}} />
}
