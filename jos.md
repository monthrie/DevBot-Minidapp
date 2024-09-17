Here's the answer formatted in Markdown:

# Parsing Comma-Separated Values in Minima Smart Contracts

It is possible to parse a string from a state variable that contains comma-separated values in a Minima smart contract. Minima's KISSVM (Keep It Simple Smart Virtual Machine) provides functions that allow you to manipulate strings and perform such operations.

## Steps

1. Retrieve the state variable containing the comma-separated string.
2. Use the `REPLACE` function to replace commas with a different delimiter (e.g., "#") that's easier to work with.
3. Use the `SUBSET` function in combination with `LEN` to extract individual elements.

## Example Script

```plaintext
LET extensions = STATE(0)
LET parsed = REPLACE(extensions "," "#")
LET len = LEN(parsed)

LET checkExtension = FUNCTION(x) {
    LET start = 0
    LET end = SUBSET(parsed start 1)
    WHILE end NEQ "" DO
        IF end EQ "#" THEN
            LET ext = SUBSET(parsed start (LEN(end) - start))
            IF ext EQ x THEN
                RETURN TRUE
            ENDIF
            LET start = LEN(end) + 1
        ENDIF
        LET end = SUBSET(parsed start (LEN(parsed) - start))
    ENDWHILE
    RETURN FALSE
}

ASSERT checkExtension("minima")
ASSERT checkExtension("mns")
ASSERT checkExtension("game")
ASSERT NOT(checkExtension("invalid"))

RETURN TRUE
```

## Script Breakdown

1. `LET extensions = STATE(0)` retrieves the state variable at port 0, which contains our comma-separated string.
2. `LET parsed = REPLACE(extensions "," "#")` replaces all commas with "#" for easier parsing.
3. `LET len = LEN(parsed)` gets the length of the parsed string.
4. We define a `checkExtension` function that takes an extension as an argument and checks if it exists in our list.
5. Inside `checkExtension`, we iterate through the string, using "#" as a delimiter:
   - We use `SUBSET` to get substrings.
   - When we find a "#", we extract the extension before it and compare it to the input.
   - If there's a match, we return TRUE.
6. After the function definition, we use `ASSERT` to check for the presence of "minima", "mns", and "game", and ensure that "invalid" is not present.

## Setting Up the State Variable

To use this script, you would need to set up the state variable first. You can do this when creating the transaction or coin that this script will be associated with. For example:

```javascript
MDS.cmd("txnstate id:yourTxnId port:0 value:\"minima,mns,game\"", function(res) {
    if (res.status) {
        console.log("State variable set:", res.response);
    }
});
```

This script demonstrates how to parse a comma-separated string in a Minima smart contract. It's flexible and can handle any number of extensions in the list. Remember that Minima scripts have a maximum execution limit, so for very long lists, you might need to optimize or restructure your approach.