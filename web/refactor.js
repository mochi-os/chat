const fs = require('fs');
const file = 'src/features/chats/components/chat-message-list.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Add imports
content = content.replace(
  "import { MessageAttachments } from './message-attachments'",
  "import { Bubble, BubbleContent, BubbleReactions, BubbleGroup } from '@/components/ui/bubble'\nimport { MessageAttachments } from './message-attachments'"
);
// Remove getChatBubbleToneClass
content = content.replace("  getChatBubbleToneClass,\n", "");

// 2. Add groupMessagesBySender
const helper = `
function groupMessagesBySender(messages: ChatMessage[]) {
  const groups: ChatMessage[][] = []
  let currentGroup: ChatMessage[] = []
  let currentSenderId: string | null = null

  for (const msg of messages) {
    if (msg.member !== currentSenderId) {
      if (currentGroup.length > 0) groups.push(currentGroup)
      currentGroup = [msg]
      currentSenderId = msg.member
    } else {
      currentGroup.push(msg)
    }
  }
  if (currentGroup.length > 0) groups.push(currentGroup)
  return groups
}
`;
content = content.replace("function checkIsAtBottom(el: HTMLDivElement) {", helper + "\nfunction checkIsAtBottom(el: HTMLDivElement) {");

// 3. Map loop
content = content.replace(
  "{groupedMessages[key].map((message) => {",
  "{groupMessagesBySender(groupedMessages[key]).map((messageGroup, groupIdx) => {\n              const isSentGroup = isCurrentUserMessage(messageGroup[0])\n              return (\n                <BubbleGroup key={`group-\${groupIdx}`} className={cn(\"w-full mb-3\", isSentGroup ? 'items-end' : 'items-start')}>\n                  {messageGroup.map((message) => {"
);

// Close BubbleGroup at the end of the message loop
content = content.replace(
  "                  </div>\n                </div>\n              )\n            })}\n          </Fragment>",
  "                  </div>\n                </div>\n              )\n            })}\n                </BubbleGroup>\n              )\n            })}\n          </Fragment>"
);

// Remove mb-3 from inner group
content = content.replace(
  "'group mb-3 flex flex-1 flex-col gap-1 rounded-lg transition-shadow',",
  "'group flex flex-1 flex-col gap-1 rounded-lg transition-shadow',"
);

// 4. Replace the message-content div
const oldBubbleStart = `<div
                        className={cn(
                          'message-content relative min-w-0 max-w-[70%] px-2 py-2 wrap-break-word transition-[opacity,transform,max-height] duration-300 ease-out',
                          getChatBubbleToneClass(isSent),
                          isDeleted && 'scale-[0.97] opacity-60',
                          enteringMessageIds.has(message.id) &&
                            'animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-backwards duration-200 ease-out'
                        )}
                      >`;
const newBubbleStart = `<Bubble
                        variant={isSent ? 'default' : 'muted'}
                        align={isSent ? 'end' : 'start'}
                        className={cn(
                          'transition-[opacity,transform,max-height] duration-300 ease-out',
                          isDeleted && 'scale-[0.97] opacity-60',
                          enteringMessageIds.has(message.id) &&
                            'animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-backwards duration-200 ease-out'
                        )}
                      >
                        <BubbleContent
                          className={cn(isDeleted && 'bg-transparent text-muted-foreground italic border-dashed')}
                        >`;

content = content.replace(oldBubbleStart, newBubbleStart);

// 5. Replace closing of message-content and add Reactions
const oldBubbleEnd = `                              </MessageBody>
                            ) : null}
                          </>
                        )}
                      </div>`;

const newBubbleEnd = `                              </MessageBody>
                            ) : null}
                          </>
                        )}
                        </BubbleContent>
                        
                        {!isSelecting && !isDeleted && (message.reaction_counts && Object.keys(message.reaction_counts).length > 0) ? (
                          <BubbleReactions>
                            <MessageReactionSummary
                              counts={message.reaction_counts ?? {}}
                              activeReaction={message.my_reaction}
                            />
                          </BubbleReactions>
                        ) : null}
                      </Bubble>`;

content = content.replace(oldBubbleEnd, newBubbleEnd);

// 6. Remove MessageReactionSummary from outer hover actions (sent side)
const sentReactionsOld = `<MessageReactionSummary
                                counts={message.reaction_counts ?? {}}
                                activeReaction={message.my_reaction}
                              />`;
content = content.replace(sentReactionsOld, "");

// 7. Remove MessageReactionSummary from outer hover actions (received side)
const receivedReactionsOld = `<MessageReactionSummary
                                counts={message.reaction_counts ?? {}}
                                activeReaction={message.my_reaction}
                              />`;
content = content.replace(receivedReactionsOld, "");

fs.writeFileSync(file, content);
